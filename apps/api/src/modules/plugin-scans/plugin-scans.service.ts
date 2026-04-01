import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { PluginScansRepository } from './plugin-scans.repository';
import {
	QUEUES,
	JOB_TYPES,
	DEFAULT_JOB_OPTIONS,
	PaginationQuery,
} from '@bedrock-forge/shared';

@Injectable()
export class PluginScansService {
	constructor(
		private readonly repo: PluginScansRepository,
		@InjectQueue(QUEUES.PLUGIN_SCANS) private readonly queue: Queue,
	) {}

	findByEnvironment(envId: number, query: PaginationQuery) {
		return this.repo.findByEnvironment(BigInt(envId), query);
	}

	async enqueueScan(environmentId: number) {
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			environment_id: BigInt(environmentId),
			queue_name: QUEUES.PLUGIN_SCANS,
			job_type: JOB_TYPES.PLUGIN_SCAN_RUN,
			bull_job_id: bullJobId,
		});
		const job = await this.queue.add(
			JOB_TYPES.PLUGIN_SCAN_RUN,
			{ environmentId, jobExecutionId: Number(exec.id) },
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: Number(exec.id), bullJobId: job.id };
	}
}
