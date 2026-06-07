import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ThemeScansRepository } from './theme-scans.repository';
import {
	QUEUES,
	JOB_TYPES,
	PaginationQuery,
} from '@bedrock-forge/shared';
import { JobOrchestratorService } from '../job-executions/job-orchestrator.service';

@Injectable()
export class ThemeScansService {
	constructor(
		private readonly repo: ThemeScansRepository,
		private readonly jobOrchestrator: JobOrchestratorService,
		@InjectQueue(QUEUES.THEME_SCANS) private readonly queue: Queue,
	) {}

	findByEnvironment(envId: number, query: PaginationQuery) {
		return this.repo.findByEnvironment(BigInt(envId), query);
	}

	async enqueueScan(environmentId: number) {
		const env = await this.requireEnv(environmentId);
		const result = await this.jobOrchestrator.enqueue({
			queue: this.queue,
			queueName: QUEUES.THEME_SCANS,
			jobType: JOB_TYPES.THEME_SCAN_RUN,
			payload: { environmentId },
			environmentId: env.id,
		});
		return { jobExecutionId: result.jobExecutionId, bullJobId: result.bullJobId };
	}

	async enqueueThemeManage(
		environmentId: number,
		action: 'activate' | 'install' | 'delete' | 'update' | 'update-all',
		slug?: string,
	) {
		const env = await this.requireEnv(environmentId);
		const result = await this.jobOrchestrator.enqueue({
			queue: this.queue,
			queueName: QUEUES.THEME_SCANS,
			jobType: JOB_TYPES.THEME_MANAGE,
			payload: { environmentId, action, slug },
			environmentId: env.id,
		});
		return { jobExecutionId: result.jobExecutionId, bullJobId: result.bullJobId };
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
