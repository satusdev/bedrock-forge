import { Injectable, NotFoundException } from '@nestjs/common';
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
import { GithubService } from '../custom-plugins/github.service';

@Injectable()
export class PluginScansService {
	constructor(
		private readonly repo: PluginScansRepository,
		@InjectQueue(QUEUES.PLUGIN_SCANS) private readonly queue: Queue,
		@InjectQueue(QUEUES.CUSTOM_PLUGINS)
		private readonly customQueue: Queue,
		private readonly github: GithubService,
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

	async enqueuePluginManage(
		environmentId: number,
		action: 'add' | 'remove' | 'update' | 'update-all',
		slug?: string,
		version?: string,
	) {
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			environment_id: BigInt(environmentId),
			queue_name: QUEUES.PLUGIN_SCANS,
			job_type: JOB_TYPES.PLUGIN_MANAGE,
			bull_job_id: bullJobId,
		});
		const job = await this.queue.add(
			JOB_TYPES.PLUGIN_MANAGE,
			{ environmentId, jobExecutionId: Number(exec.id), action, slug, version },
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: Number(exec.id), bullJobId: job.id };
	}

	async enqueueConstraintChange(
		environmentId: number,
		slug: string,
		constraint: string,
	) {
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			environment_id: BigInt(environmentId),
			queue_name: QUEUES.PLUGIN_SCANS,
			job_type: JOB_TYPES.PLUGIN_MANAGE,
			bull_job_id: bullJobId,
		});
		const job = await this.queue.add(
			JOB_TYPES.PLUGIN_MANAGE,
			{
				environmentId,
				jobExecutionId: Number(exec.id),
				action: 'change-constraint',
				slug,
				constraint,
			},
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: Number(exec.id), bullJobId: job.id };
	}

	async enqueueComposerRead(environmentId: number) {
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			environment_id: BigInt(environmentId),
			queue_name: QUEUES.PLUGIN_SCANS,
			job_type: JOB_TYPES.PLUGIN_MANAGE,
			bull_job_id: bullJobId,
		});
		const job = await this.queue.add(
			JOB_TYPES.PLUGIN_MANAGE,
			{ environmentId, jobExecutionId: Number(exec.id), action: 'read' },
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);
		return { jobExecutionId: Number(exec.id), bullJobId: job.id };
	}

	async findExecution(execId: number) {
		return this.repo.findJobExecution(BigInt(execId));
	}

	// ─── Custom GitHub plugin methods ────────────────────────────────────────

	listEnvironmentCustomPlugins(envId: number) {
		return this.repo.listEnvironmentCustomPlugins(BigInt(envId));
	}

	async enqueueCustomPluginManage(
		environmentId: number,
		customPluginId: number,
		action: 'add' | 'remove',
	) {
		const plugin = await this.repo.findCustomPlugin(BigInt(customPluginId));
		if (!plugin) {
			throw new NotFoundException(`Custom plugin ${customPluginId} not found`);
		}

		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			environment_id: BigInt(environmentId),
			queue_name: QUEUES.CUSTOM_PLUGINS,
			job_type: JOB_TYPES.CUSTOM_PLUGIN_MANAGE,
			bull_job_id: bullJobId,
		});

		const job = await this.customQueue.add(
			JOB_TYPES.CUSTOM_PLUGIN_MANAGE,
			{
				environmentId,
				jobExecutionId: Number(exec.id),
				action,
				customPluginId,
				slug: plugin.slug,
				repoUrl: plugin.repo_url,
				repoPath: plugin.repo_path,
				type: plugin.type,
			},
			{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
		);

		return { jobExecutionId: Number(exec.id), bullJobId: job.id };
	}

	async checkCustomPluginVersions(envId: number) {
		const installed = await this.repo.listEnvironmentCustomPlugins(
			BigInt(envId),
		);

		const results = await Promise.all(
			installed.map(async entry => {
				const latestVersion = await this.github.getLatestTag(
					entry.custom_plugin.repo_url,
				);
				if (latestVersion !== null) {
					await this.repo.updateEnvironmentCustomPlugin(
						entry.environment_id,
						entry.custom_plugin_id,
						{ latest_version: latestVersion, version_checked_at: new Date() },
					);
				}
				return {
					slug: entry.custom_plugin.slug,
					installed_version: entry.installed_version,
					latest_version: latestVersion ?? entry.latest_version,
				};
			}),
		);

		return results;
	}
}
