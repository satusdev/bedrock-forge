import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SecurityRepository } from './security.repository';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import type {
	SecurityScanType,
	ServerHardeningActionType,
	EnvironmentHardeningActionType,
} from '@bedrock-forge/shared';

@Injectable()
export class SecurityScanService {
	private readonly logger = new Logger(SecurityScanService.name);

	constructor(
		private readonly repo: SecurityRepository,
		@InjectQueue(QUEUES.SECURITY) private readonly securityQueue: Queue,
	) {}

	async triggerServerScan(
		serverId: number,
		types: ('SSH_AUDIT' | 'SERVER_HARDENING' | 'MALWARE_SCAN')[],
	) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		// Create a JobExecution row
		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.SECURITY,
			job_type: JOB_TYPES.SECURITY_SERVER_SCAN,
			server_id: BigInt(serverId),
			status: 'queued',
			payload: { serverId, types },
		});

		// Pre-create SecurityScan rows atomically so either all types are created
		// or none are — prevents orphan rows and incomplete scanIds arrays.
		const createdScans = await this.repo.createServerScansTransaction(
			BigInt(serverId),
			execution.id,
			types,
		);
		const scanIds = createdScans.map(s => Number(s.id));

		let bullJob;
		try {
			bullJob = await this.securityQueue.add(
				JOB_TYPES.SECURITY_SERVER_SCAN,
				{
					serverId,
					scanTypes: types,
					jobExecutionId: Number(execution.id),
					scanIds,
				},
				{
					...DEFAULT_JOB_OPTIONS,
					jobId: `security-server-${serverId}-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await Promise.all([
				this.repo.failSecurityScans(createdScans.map(s => s.id)),
				this.repo.updateJobExecution(execution.id, {
					status: 'failed',
					last_error: errMsg,
				}),
			]);
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id), scanIds };
	}

	async triggerEnvironmentScan(
		environmentId: number,
		types: SecurityScanType[],
	) {
		const env = await this.repo.findEnvironmentById(BigInt(environmentId));
		if (!env)
			throw new NotFoundException(`Environment ${environmentId} not found`);

		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.SECURITY,
			job_type: JOB_TYPES.SECURITY_ENVIRONMENT_SCAN,
			environment_id: BigInt(environmentId),
			server_id: env.server_id,
			status: 'queued',
			payload: { environmentId, types },
		});

		const createdScans = await this.repo.createEnvironmentScansTransaction(
			BigInt(environmentId),
			execution.id,
			types,
		);
		const scanIds = createdScans.map(s => Number(s.id));

		let bullJob;
		try {
			bullJob = await this.securityQueue.add(
				JOB_TYPES.SECURITY_ENVIRONMENT_SCAN,
				{
					environmentId,
					scanTypes: types,
					jobExecutionId: Number(execution.id),
					scanIds,
				},
				{
					...DEFAULT_JOB_OPTIONS,
					jobId: `security-env-${environmentId}-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await Promise.all([
				this.repo.failSecurityScans(createdScans.map(s => s.id)),
				this.repo.updateJobExecution(execution.id, {
					status: 'failed',
					last_error: errMsg,
				}),
			]);
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id), scanIds };
	}

	async applyServerHardening(
		serverId: number,
		actions: ServerHardeningActionType[],
	) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.SECURITY,
			job_type: JOB_TYPES.SECURITY_SERVER_HARDEN,
			server_id: BigInt(serverId),
			status: 'queued',
			payload: { serverId, actions },
		});

		let bullJob;
		try {
			bullJob = await this.securityQueue.add(
				JOB_TYPES.SECURITY_SERVER_HARDEN,
				{ serverId, jobExecutionId: Number(execution.id), actions },
				{
					...DEFAULT_JOB_OPTIONS,
					jobId: `security-harden-server-${serverId}-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(execution.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id) };
	}

	async applyEnvironmentHardening(
		environmentId: number,
		actions: EnvironmentHardeningActionType[],
	) {
		const env = await this.repo.findEnvironmentById(BigInt(environmentId));
		if (!env)
			throw new NotFoundException(`Environment ${environmentId} not found`);

		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.SECURITY,
			job_type: JOB_TYPES.SECURITY_ENVIRONMENT_HARDEN,
			environment_id: BigInt(environmentId),
			server_id: env.server_id,
			status: 'queued',
			payload: { environmentId, actions },
		});

		let bullJob;
		try {
			bullJob = await this.securityQueue.add(
				JOB_TYPES.SECURITY_ENVIRONMENT_HARDEN,
				{ environmentId, jobExecutionId: Number(execution.id), actions },
				{
					...DEFAULT_JOB_OPTIONS,
					jobId: `security-harden-env-${environmentId}-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(execution.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id) };
	}
}
