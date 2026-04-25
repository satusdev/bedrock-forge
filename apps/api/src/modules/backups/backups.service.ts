import {
	Injectable,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import {
	QUEUES,
	JOB_TYPES,
	DEFAULT_JOB_OPTIONS,
	BACKUP_JOB_OPTIONS,
	PaginationQuery,
} from '@bedrock-forge/shared';
import { EnqueueBackupDto, RestoreBackupDto } from './dto/backup.dto';
import { BackupsRepository } from './backups.repository';

@Injectable()
export class BackupsService {
	constructor(
		private readonly repo: BackupsRepository,
		@InjectQueue(QUEUES.BACKUPS) private readonly backupsQueue: Queue,
	) {}

	findByEnvironment(envId: number, query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		return this.repo.findByEnvironmentPaginated(BigInt(envId), page, limit);
	}

	async findOne(id: number) {
		const b = await this.repo.findById(BigInt(id));
		if (!b) throw new NotFoundException(`Backup ${id} not found`);
		return b;
	}

	async enqueueCreate(dto: EnqueueBackupDto) {
		const env = await this.repo.findEnvironment(BigInt(dto.environmentId));
		if (!env) {
			throw new NotFoundException(`Environment ${dto.environmentId} not found`);
		}
		if (!env.google_drive_folder_id) {
			throw new BadRequestException(
				`Environment ${dto.environmentId} has no Google Drive folder ID configured.`,
			);
		}

		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.BACKUPS,
			job_type: JOB_TYPES.BACKUP_CREATE,
			bull_job_id: bullJobId,
			environment_id: BigInt(dto.environmentId),
			payload: { environmentId: dto.environmentId, type: dto.type } as Record<
				string,
				string | number
			>,
		});
		// Create the Backup row immediately so the UI can show pending state.
		// The worker updates this row to running → completed | failed.
		const backup = await this.repo.create({
			environment_id: BigInt(dto.environmentId),
			job_execution_id: exec.id,
			type: dto.type as 'full' | 'db_only' | 'files_only',
			status: 'pending',
		});
		const job = await this.backupsQueue.add(
			JOB_TYPES.BACKUP_CREATE,
			{
				environmentId: dto.environmentId,
				type: dto.type,
				jobExecutionId: Number(exec.id),
				backupId: Number(backup.id),
			},
			{ ...BACKUP_JOB_OPTIONS, jobId: bullJobId },
		);
		return {
			jobExecutionId: Number(exec.id),
			bullJobId: job.id,
			backupId: Number(backup.id),
		};
	}

	async enqueueRestore(dto: RestoreBackupDto) {
		const backup = await this.findOne(dto.backupId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.BACKUPS,
			job_type: JOB_TYPES.BACKUP_RESTORE,
			bull_job_id: bullJobId,
			environment_id: backup.environment_id,
			payload: {
				backupId: dto.backupId,
				environmentId: Number(backup.environment_id),
			} as Record<string, number>,
		});
		const job = await this.backupsQueue.add(
			JOB_TYPES.BACKUP_RESTORE,
			{
				backupId: dto.backupId,
				environmentId: Number(backup.environment_id),
				jobExecutionId: Number(exec.id),
			},
			{ ...BACKUP_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: exec.id, bullJobId: job.id };
	}

	async findJobExecution(id: number) {
		const exec = await this.repo.findJobExecutionById(BigInt(id));
		if (!exec) throw new NotFoundException(`JobExecution ${id} not found`);
		return exec;
	}

	async findJobExecutionLog(id: number) {
		const exec = await this.repo.findJobExecutionLog(BigInt(id));
		if (!exec) throw new NotFoundException(`JobExecution ${id} not found`);
		return exec;
	}

	async cancelJobExecution(id: number) {
		const exec = await this.repo.findJobExecutionById(BigInt(id));
		if (!exec) throw new NotFoundException(`JobExecution ${id} not found`);
		if (exec.status !== 'active') {
			throw new BadRequestException(
				`Job execution ${id} is not active (status: ${exec.status})`,
			);
		}

		// Write a cancellation token into Redis — the worker checks this in
		// its progress callback and kills the rclone child process when found.
		const client = await this.backupsQueue.client;
		await client.set(`forge:cancel:${exec.bull_job_id}`, '1', 'EX', 3600);

		// Optimistically mark as failed; the worker will finalise the log entry.
		await this.repo.updateJobExecution(BigInt(id), {
			status: 'failed',
			last_error: 'Cancelled by user',
			completed_at: new Date(),
		});

		return { cancelled: true };
	}

	async remove(id: number) {
		const backup = await this.findOne(id);
		// Enqueue async GDrive file deletion before removing the DB record
		if (backup.file_path) {
			await this.backupsQueue.add(
				JOB_TYPES.BACKUP_DELETE_FILE,
				{ filePath: backup.file_path },
				{ ...DEFAULT_JOB_OPTIONS, attempts: 5 },
			);
		}
		return this.repo.delete(BigInt(id));
	}
}
