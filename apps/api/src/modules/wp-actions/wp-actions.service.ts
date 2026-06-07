import {
	Injectable,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import { WpActionsRepository } from './wp-actions.repository';
import { ServersService } from '../servers/servers.service';
import {
	WpFixActionDto,
	WpDebugModeDto,
	WpLogsQueryDto,
	WpMaintenanceModeDto,
} from './dto/wp-actions.dto';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class WpActionsService {
	constructor(
		private readonly repo: WpActionsRepository,
		private readonly serversService: ServersService,
		@InjectQueue(QUEUES.WP_ACTIONS) private readonly wpActionsQueue: Queue,
	) {}

	// ─── Async job enqueue ────────────────────────────────────────────────────

	async enqueueFix(envId: number, dto: WpFixActionDto) {
		const env = await this.requireEnv(envId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.WP_ACTIONS,
			job_type: JOB_TYPES.WP_FIX_ACTION,
			bull_job_id: bullJobId,
			environment_id: env.id,
			payload: { environmentId: envId, action: dto.action },
		});
		try {
			await this.wpActionsQueue.add(
				JOB_TYPES.WP_FIX_ACTION,
				{
					environmentId: envId,
					action: dto.action,
					jobExecutionId: Number(exec.id),
				},
				{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(exec.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}
		return { jobExecutionId: Number(exec.id), bullJobId };
	}

	async enqueueDebugMode(envId: number, dto: WpDebugModeDto) {
		const env = await this.requireEnv(envId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.WP_ACTIONS,
			job_type: JOB_TYPES.WP_DEBUG_TOGGLE,
			bull_job_id: bullJobId,
			environment_id: env.id,
			payload: {
				environmentId: envId,
				enabled: dto.enabled,
				revertAfterMinutes: dto.revert_after_minutes,
			},
		});
		try {
			await this.wpActionsQueue.add(
				JOB_TYPES.WP_DEBUG_TOGGLE,
				{
					environmentId: envId,
					enabled: dto.enabled,
					revertAfterMinutes: dto.revert_after_minutes,
					jobExecutionId: Number(exec.id),
				},
				{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(exec.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}
		return { jobExecutionId: Number(exec.id), bullJobId };
	}

	async enqueueCleanup(envId: number, dryRun: boolean, keepRevisions?: number) {
		const env = await this.requireEnv(envId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.WP_ACTIONS,
			job_type: JOB_TYPES.WP_CLEANUP,
			bull_job_id: bullJobId,
			environment_id: env.id,
			payload: { environmentId: envId, dryRun, keepRevisions },
		});
		try {
			await this.wpActionsQueue.add(
				JOB_TYPES.WP_CLEANUP,
				{
					environmentId: envId,
					dryRun,
					keepRevisions,
					jobExecutionId: Number(exec.id),
				},
				{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(exec.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}
		return { jobExecutionId: Number(exec.id), bullJobId };
	}

	async enqueueCoreCheck(envId: number) {
		const env = await this.requireEnv(envId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.WP_ACTIONS,
			job_type: JOB_TYPES.WP_CORE_CHECK,
			bull_job_id: bullJobId,
			environment_id: env.id,
			payload: { environmentId: envId },
		});
		try {
			await this.wpActionsQueue.add(
				JOB_TYPES.WP_CORE_CHECK,
				{ environmentId: envId, jobExecutionId: Number(exec.id) },
				{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(exec.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}
		return { jobExecutionId: Number(exec.id), bullJobId };
	}

	async enqueueCoreUpdate(envId: number) {
		const env = await this.requireEnv(envId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.WP_ACTIONS,
			job_type: JOB_TYPES.WP_CORE_UPDATE,
			bull_job_id: bullJobId,
			environment_id: env.id,
			payload: { environmentId: envId },
		});
		try {
			await this.wpActionsQueue.add(
				JOB_TYPES.WP_CORE_UPDATE,
				{ environmentId: envId, jobExecutionId: Number(exec.id) },
				{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(exec.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}
		return { jobExecutionId: Number(exec.id), bullJobId };
	}

	async enqueueMaintenanceMode(envId: number, dto: WpMaintenanceModeDto) {
		const env = await this.requireEnv(envId);
		const bullJobId = randomUUID();
		const exec = await this.repo.createJobExecution({
			queue_name: QUEUES.WP_ACTIONS,
			job_type: JOB_TYPES.WP_MAINTENANCE_MODE,
			bull_job_id: bullJobId,
			environment_id: env.id,
			payload: {
				environmentId: envId,
				enabled: dto.enabled,
				revertAfterMinutes: dto.revert_after_minutes,
				message: dto.message,
			},
		});
		try {
			await this.wpActionsQueue.add(
				JOB_TYPES.WP_MAINTENANCE_MODE,
				{
					environmentId: envId,
					enabled: dto.enabled,
					revertAfterMinutes: dto.revert_after_minutes,
					message: dto.message,
					jobExecutionId: Number(exec.id),
				},
				{ ...DEFAULT_JOB_OPTIONS, jobId: bullJobId },
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(exec.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}
		return { jobExecutionId: Number(exec.id), bullJobId };
	}

	// ─── Synchronous SSH calls ────────────────────────────────────────────────

	async getDebugStatus(envId: number) {
		const { executor, env } = await this.connectToEnv(envId);
		const scriptsPath = join(__dirname, '../../../../worker/scripts');
		const remoteScript = `/tmp/wp_debug_status_${Date.now()}.php`;
		await executor.pushFile({
			remotePath: remoteScript,
			content: readFileSync(join(scriptsPath, 'wp-debug.php')),
		});
		try {
			const result = await executor.execute(
				`php ${remoteScript} --docroot=${shellQuote(env.root_path ?? '')} --action=status`,
				{ timeout: 10_000 },
			);
			const parsed = safeJsonParse(result.stdout);
			return parsed ?? { success: false, error: result.stderr };
		} finally {
			await executor
				.execute(`rm -f ${remoteScript}`, { timeout: 5_000 })
				.catch(() => {});
		}
	}

	async getLogs(envId: number, query: WpLogsQueryDto) {
		const { executor, env } = await this.connectToEnv(envId);
		const scriptsPath = join(__dirname, '../../../../worker/scripts');
		const remoteScript = `/tmp/wp_logs_${Date.now()}.php`;
		await executor.pushFile({
			remotePath: remoteScript,
			content: readFileSync(join(scriptsPath, 'wp-logs.php')),
		});
		try {
			const type = query.type ?? 'debug';
			const lines = query.lines ?? 100;
			const result = await executor.execute(
				`php ${remoteScript} --docroot=${shellQuote(env.root_path ?? '')} --type=${shellQuote(type)} --lines=${lines}`,
				{ timeout: 15_000 },
			);
			return (
				safeJsonParse(result.stdout) ?? { success: false, error: result.stderr }
			);
		} finally {
			await executor
				.execute(`rm -f ${remoteScript}`, { timeout: 5_000 })
				.catch(() => {});
		}
	}

	async getCron(envId: number) {
		const { executor, env } = await this.connectToEnv(envId);
		const scriptsPath = join(__dirname, '../../../../worker/scripts');
		const remoteScript = `/tmp/wp_cron_${Date.now()}.php`;
		await executor.pushFile({
			remotePath: remoteScript,
			content: readFileSync(join(scriptsPath, 'wp-cron.php')),
		});
		try {
			const result = await executor.execute(
				`php ${remoteScript} --docroot=${shellQuote(env.root_path ?? '')}`,
				{ timeout: 20_000 },
			);
			return (
				safeJsonParse(result.stdout) ?? { success: false, error: result.stderr }
			);
		} finally {
			await executor
				.execute(`rm -f ${remoteScript}`, { timeout: 5_000 })
				.catch(() => {});
		}
	}

	async getMaintenanceStatus(envId: number) {
		const { executor, env } = await this.connectToEnv(envId);
		const wpPath = await this.resolveWpPathForStatus(executor, env.root_path ?? '');
		const cmd = `wp maintenance-mode status --skip-plugins --path=${shellQuote(wpPath)} --allow-root`;
		const result = await executor.execute(cmd, { timeout: 20_000 });
		const output = `${result.stdout}\n${result.stderr}`.trim();
		if (result.code === 0) {
			return {
				success: true,
				enabled: /active|enabled|on/i.test(output),
				output,
				source: 'wp-cli',
			};
		}
		const fileCheck = await executor.execute(
			`test -f ${shellQuote(wpPath + '/.maintenance')} && echo active || echo inactive`,
			{ timeout: 10_000 },
		);
		return {
			success: true,
			enabled: fileCheck.stdout.trim() === 'active',
			output: output || fileCheck.stdout.trim(),
			source: 'file',
		};
	}

	// ─── Helpers ──────────────────────────────────────────────────────────────

	private async requireEnv(envId: number) {
		const env = await this.repo.findEnvironment(BigInt(envId));
		if (!env) throw new NotFoundException(`Environment ${envId} not found`);
		if (!env.root_path)
			throw new BadRequestException(
				`Environment ${envId} has no root_path configured`,
			);
		return env;
	}

	private async connectToEnv(envId: number) {
		const env = await this.repo.findEnvironment(BigInt(envId));
		if (!env) throw new NotFoundException(`Environment ${envId} not found`);
		if (!env.server)
			throw new BadRequestException(
				`Environment ${envId} has no associated server`,
			);
		const sshConfig = await this.serversService.getServerSshConfig(
			Number(env.server.id),
		);
		const executor = createRemoteExecutor(sshConfig);
		return { executor, env };
	}

	private async resolveWpPathForStatus(
		executor: Awaited<ReturnType<typeof createRemoteExecutor>>,
		rootPath: string,
	): Promise<string> {
		const bedrockCheck = await executor.execute(
			`[ -d ${shellQuote(rootPath + '/web/wp')} ] && echo bedrock || echo standard`,
			{ timeout: 10_000 },
		);
		return bedrockCheck.stdout.trim() === 'bedrock'
			? `${rootPath}/web/wp`
			: rootPath;
	}
}

function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

function safeJsonParse(str: string): unknown {
	try {
		return JSON.parse(str.trim());
	} catch {
		return null;
	}
}
