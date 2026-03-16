import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import { SyncCloneDto, SyncPushDto } from './dto/sync.dto';

@Injectable()
export class SyncService {
	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.SYNC) private readonly queue: Queue,
	) {}

	async enqueueClone(dto: SyncCloneDto) {
		const exec = await this.prisma.jobExecution.create({
			data: {
				environment_id: BigInt(dto.targetEnvironmentId),
				job_type: JOB_TYPES.SYNC_CLONE,
				status: 'pending',
			},
		});
		const job = await this.queue.add(
			JOB_TYPES.SYNC_CLONE,
			{ ...dto, jobExecutionId: Number(exec.id) },
			{ ...DEFAULT_JOB_OPTIONS, jobId: `sync-clone-${exec.id}` },
		);
		return { jobExecutionId: exec.id, bullJobId: job.id };
	}

	async enqueuePush(dto: SyncPushDto) {
		const exec = await this.prisma.jobExecution.create({
			data: {
				environment_id: BigInt(dto.environmentId),
				job_type: JOB_TYPES.SYNC_PUSH,
				status: 'pending',
			},
		});
		const job = await this.queue.add(
			JOB_TYPES.SYNC_PUSH,
			{ ...dto, jobExecutionId: Number(exec.id) },
			{ ...DEFAULT_JOB_OPTIONS, jobId: `sync-push-${exec.id}` },
		);
		return { jobExecutionId: exec.id, bullJobId: job.id };
	}
}
