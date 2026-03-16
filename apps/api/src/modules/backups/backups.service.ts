import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
	QUEUES,
	JOB_TYPES,
	DEFAULT_JOB_OPTIONS,
	PaginationQuery,
} from '@bedrock-forge/shared';
import { EnqueueBackupDto, RestoreBackupDto } from './dto/backup.dto';

@Injectable()
export class BackupsService {
	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.BACKUPS) private readonly backupsQueue: Queue,
	) {}

	findByEnvironment(envId: number, query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const skip = (page - 1) * limit;
		return this.prisma
			.$transaction([
				this.prisma.backup.findMany({
					where: { environment_id: BigInt(envId) },
					skip,
					take: limit,
					orderBy: { created_at: 'desc' },
				}),
				this.prisma.backup.count({ where: { environment_id: BigInt(envId) } }),
			])
			.then(([items, total]) => ({ items, total, page, limit }));
	}

	async findOne(id: number) {
		const b = await this.prisma.backup.findUnique({
			where: { id: BigInt(id) },
		});
		if (!b) throw new NotFoundException(`Backup ${id} not found`);
		return b;
	}

	async enqueueCreate(dto: EnqueueBackupDto) {
		const exec = await this.prisma.jobExecution.create({
			data: {
				environment_id: BigInt(dto.environmentId),
				job_type: JOB_TYPES.BACKUP_CREATE,
				status: 'pending',
			},
		});
		const job = await this.backupsQueue.add(
			JOB_TYPES.BACKUP_CREATE,
			{
				environmentId: dto.environmentId,
				type: dto.type,
				label: dto.label,
				jobExecutionId: Number(exec.id),
			},
			{ ...DEFAULT_JOB_OPTIONS, jobId: `backup-create-${exec.id}` },
		);
		return { jobExecutionId: exec.id, bullJobId: job.id };
	}

	async enqueueRestore(dto: RestoreBackupDto) {
		const backup = await this.findOne(dto.backupId);
		const exec = await this.prisma.jobExecution.create({
			data: {
				environment_id: backup.environment_id,
				job_type: JOB_TYPES.BACKUP_RESTORE,
				status: 'pending',
			},
		});
		const job = await this.backupsQueue.add(
			JOB_TYPES.BACKUP_RESTORE,
			{
				backupId: dto.backupId,
				environmentId: Number(backup.environment_id),
				jobExecutionId: Number(exec.id),
			},
			{ ...DEFAULT_JOB_OPTIONS, jobId: `backup-restore-${exec.id}` },
		);
		return { jobExecutionId: exec.id, bullJobId: job.id };
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.prisma.backup.delete({ where: { id: BigInt(id) } });
	}
}
