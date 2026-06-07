import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { SshKeyService } from '../../../services/ssh-key.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import type {
	SecurityServerHardeningPayload,
	SecurityEnvironmentHardeningPayload,
} from '@bedrock-forge/shared';
import {
	applyServerHardeningActions,
	applyEnvironmentHardeningActions,
} from '../hardening-actions';

@Injectable()
export class SecurityHardeningService {
	private readonly logger = new Logger(SecurityHardeningService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly sshKey: SshKeyService,
	) {}

	async processServerHardening(job: Job) {
		const payload = job.data as SecurityServerHardeningPayload;
		const { serverId, jobExecutionId, actions } = payload;

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
		});

		try {
			const server = await this.prisma.server.findUnique({
				where: { id: BigInt(serverId) },
			});
			if (!server) throw new Error(`Server ${serverId} not found`);

			const privateKey = await this.sshKey.resolvePrivateKey(server);
			const executor = createRemoteExecutor({
				host: server.ip_address,
				port: server.ssh_port,
				username: server.ssh_user,
				privateKey,
			});

			const results = await applyServerHardeningActions(executor, actions);

			const logEntries = results.map(r => ({
				ts: new Date().toISOString(),
				step: r.action,
				level:
					r.status === 'failed'
						? 'error'
						: r.status === 'skipped'
							? 'warn'
							: 'info',
				detail: r.detail,
				hardenStatus: r.status,
			}));

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: {
					status: 'completed',
					completed_at: new Date(),
					execution_log: logEntries as object[],
				},
			});

			this.logger.log(
				`Server hardening ${jobExecutionId} completed — ${results.length} action(s)`,
			);
			return results;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(
				`Server hardening ${jobExecutionId} failed: ${message}`,
			);
			await this.failExecution(jobExecutionId, message);
			throw err;
		}
	}

	async processEnvironmentHardening(job: Job) {
		const payload = job.data as SecurityEnvironmentHardeningPayload;
		const { environmentId, jobExecutionId, actions } = payload;

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
		});

		try {
			const env = await this.prisma.environment.findUnique({
				where: { id: BigInt(environmentId) },
				include: { server: true },
			});
			if (!env) throw new Error(`Environment ${environmentId} not found`);

			const privateKey = await this.sshKey.resolvePrivateKey(env.server);
			const executor = createRemoteExecutor({
				host: env.server.ip_address,
				port: env.server.ssh_port,
				username: env.server.ssh_user,
				privateKey,
			});

			const rootPath = env.root_path;
			const results = await applyEnvironmentHardeningActions(
				executor,
				rootPath,
				actions,
			);

			const logEntries = results.map(r => ({
				ts: new Date().toISOString(),
				step: r.action,
				level:
					r.status === 'failed'
						? 'error'
						: r.status === 'skipped'
							? 'warn'
							: 'info',
				detail: r.detail,
				hardenStatus: r.status,
			}));

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: {
					status: 'completed',
					completed_at: new Date(),
					execution_log: logEntries as object[],
				},
			});

			this.logger.log(
				`Environment hardening ${jobExecutionId} completed — ${results.length} action(s)`,
			);
			return results;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(
				`Environment hardening ${jobExecutionId} failed: ${message}`,
			);
			await this.failExecution(jobExecutionId, message);
			throw err;
		}
	}

	private async failExecution(jobExecutionId: number, error: string) {
		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'failed', last_error: error, completed_at: new Date() },
		});
	}
}
