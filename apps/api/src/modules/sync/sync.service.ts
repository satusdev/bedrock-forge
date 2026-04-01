import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import { SyncCloneDto, SyncPushDto } from './dto/sync.dto';
import { SyncRepository } from './sync.repository';

@Injectable()
export class SyncService {
	constructor(
		private readonly repo: SyncRepository,
		@InjectQueue(QUEUES.SYNC) private readonly queue: Queue,
	) {}

	async enqueueClone(dto: SyncCloneDto) {
		// Validate target environment has a Google Drive folder configured.
		// Sync overwrites the target DB; a safety backup to GDrive is mandatory.
		// skipSafetyBackup bypasses this check — the user explicitly accepts the risk.
		if (!dto.skipSafetyBackup) {
			const targetEnv = await this.repo.findEnvironmentById(
				dto.targetEnvironmentId,
			);
			if (!targetEnv.google_drive_folder_id) {
				throw new BadRequestException(
					'Target environment has no Google Drive folder configured. ' +
						'A safety backup is required before sync. ' +
						'Set a Google Drive folder on the target environment first.',
				);
			}
		}

		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.SYNC,
			job_type: JOB_TYPES.SYNC_CLONE,
			bull_job_id: bullJobId,
			environment_id: BigInt(dto.targetEnvironmentId),
		});
		const job = await this.queue.add(
			JOB_TYPES.SYNC_CLONE,
			{ ...dto, jobExecutionId: Number(exec.id) },
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: Number(exec.id), jobId: job.id };
	}

	async enqueuePush(dto: SyncPushDto) {
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.SYNC,
			job_type: JOB_TYPES.SYNC_PUSH,
			bull_job_id: bullJobId,
			environment_id: BigInt(dto.environmentId),
		});
		const job = await this.queue.add(
			JOB_TYPES.SYNC_PUSH,
			{ ...dto, jobExecutionId: Number(exec.id) },
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: Number(exec.id), jobId: job.id };
	}
}
