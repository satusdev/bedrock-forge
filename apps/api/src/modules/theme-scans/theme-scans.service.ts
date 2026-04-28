import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { ThemeScansRepository } from './theme-scans.repository';
import {
	QUEUES,
	JOB_TYPES,
	DEFAULT_JOB_OPTIONS,
	PaginationQuery,
} from '@bedrock-forge/shared';

@Injectable()
export class ThemeScansService {
	constructor(
		private readonly repo: ThemeScansRepository,
		@InjectQueue(QUEUES.THEME_SCANS) private readonly queue: Queue,
	) {}

	findByEnvironment(envId: number, query: PaginationQuery) {
		return this.repo.findByEnvironment(BigInt(envId), query);
	}

	async enqueueScan(environmentId: number) {
		await this.requireEnv(environmentId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			environment_id: BigInt(environmentId),
			queue_name: QUEUES.THEME_SCANS,
			job_type: JOB_TYPES.THEME_SCAN_RUN,
			bull_job_id: bullJobId,
		});
		const job = await this.queue.add(
			JOB_TYPES.THEME_SCAN_RUN,
			{ environmentId, jobExecutionId: Number(exec.id) },
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: Number(exec.id), bullJobId: job.id };
	}

	async enqueueThemeManage(
		environmentId: number,
		action: 'activate' | 'install' | 'delete' | 'update' | 'update-all',
		slug?: string,
	) {
		await this.requireEnv(environmentId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			environment_id: BigInt(environmentId),
			queue_name: QUEUES.THEME_SCANS,
			job_type: JOB_TYPES.THEME_MANAGE,
			bull_job_id: bullJobId,
		});
		const job = await this.queue.add(
			JOB_TYPES.THEME_MANAGE,
			{ environmentId, jobExecutionId: Number(exec.id), action, slug },
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: Number(exec.id), bullJobId: job.id };
	}

	findJobExecution(execId: number) {
		return this.repo.findJobExecution(BigInt(execId));
	}

	private async requireEnv(envId: number) {
		const env = await this.repo.findEnvironment(BigInt(envId));
		if (!env) throw new NotFoundException(`Environment ${envId} not found`);
		return env;
	}
}
