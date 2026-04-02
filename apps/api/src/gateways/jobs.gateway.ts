import {
	WebSocketGateway,
	WebSocketServer,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	MessageBody,
	ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { QueueEvents } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
	WS_EVENTS,
	QUEUES,
	JobProgressEvent,
	JobCompletedEvent,
	JobFailedEvent,
	MonitorResultEvent,
} from '@bedrock-forge/shared';

/**
 * JobsGateway — WebSocket gateway for real-time job status updates.
 *
 * Clients connect with a JWT token in the auth handshake.
 * Once connected, they can subscribe to specific environments.
 *
 * BullMQ QueueEvents listeners bridge Worker progress events (Redis) to
 * WebSocket clients — no direct coupling between Worker and API processes.
 */
@WebSocketGateway({
	cors: { origin: '*', credentials: true },
	namespace: '/ws',
})
export class JobsGateway
	implements
		OnGatewayConnection,
		OnGatewayDisconnect,
		OnModuleInit,
		OnModuleDestroy
{
	@WebSocketServer()
	server!: Server;

	private readonly logger = new Logger(JobsGateway.name);
	private backupsQueueEvents!: QueueEvents;
	private projectsQueueEvents!: QueueEvents;
	private pluginScansQueueEvents!: QueueEvents;
	private syncQueueEvents!: QueueEvents;
	private monitorsQueueEvents!: QueueEvents;

	constructor(
		private readonly jwtService: JwtService,
		private readonly config: ConfigService,
		private readonly prisma: PrismaService,
	) {}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	onModuleInit() {
		const redisUrl = this.config.get<string>('redis.url')!;
		this.backupsQueueEvents = new QueueEvents(QUEUES.BACKUPS, {
			connection: { url: redisUrl },
		});

		this.backupsQueueEvents.on('progress', async ({ jobId, data }) => {
			const isObj = typeof data === 'object' && data !== null;
			const progress =
				typeof data === 'number'
					? data
					: ((data as { value?: number })?.value ?? 0);
			const step = isObj ? (data as { step?: string })?.step : undefined;
			const envId = await this.resolveEnvId(jobId);
			this.emitJobProgress({
				jobId,
				queueName: QUEUES.BACKUPS,
				progress,
				step,
				environmentId: envId,
			});
		});

		this.backupsQueueEvents.on('completed', async ({ jobId }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobCompleted({
				jobId,
				queueName: QUEUES.BACKUPS,
				environmentId: envId,
			});
		});

		this.backupsQueueEvents.on('failed', async ({ jobId, failedReason }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobFailed({
				jobId,
				queueName: QUEUES.BACKUPS,
				error: failedReason,
				attempt: 1,
				environmentId: envId,
			});
		});

		this.backupsQueueEvents.on('stalled', async ({ jobId }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobFailed({
				jobId,
				queueName: QUEUES.BACKUPS,
				error: 'Job stalled — worker may have crashed',
				attempt: 1,
				environmentId: envId,
			});
		});

		// ── Projects queue bridge ──────────────────────────────────────────────
		this.projectsQueueEvents = new QueueEvents(QUEUES.PROJECTS, {
			connection: { url: redisUrl },
		});

		this.projectsQueueEvents.on('progress', async ({ jobId, data }) => {
			const isObj = typeof data === 'object' && data !== null;
			const progress =
				typeof data === 'number'
					? data
					: ((data as { value?: number })?.value ?? 0);
			const step = isObj ? (data as { step?: string })?.step : undefined;
			const envId = await this.resolveEnvId(jobId);
			this.emitJobProgress({
				jobId,
				queueName: QUEUES.PROJECTS,
				progress,
				step,
				environmentId: envId,
			});
		});

		this.projectsQueueEvents.on('completed', async ({ jobId }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobCompleted({
				jobId,
				queueName: QUEUES.PROJECTS,
				environmentId: envId,
			});
		});

		this.projectsQueueEvents.on('failed', async ({ jobId, failedReason }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobFailed({
				jobId,
				queueName: QUEUES.PROJECTS,
				error: failedReason,
				attempt: 1,
				environmentId: envId,
			});
		});

		this.projectsQueueEvents.on('stalled', async ({ jobId }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobFailed({
				jobId,
				queueName: QUEUES.PROJECTS,
				error: 'Job stalled — worker may have crashed',
				attempt: 1,
				environmentId: envId,
			});
		});

		// ── Plugin scans queue bridge ────────────────────────────────────────────
		this.pluginScansQueueEvents = new QueueEvents(QUEUES.PLUGIN_SCANS, {
			connection: { url: redisUrl },
		});

		this.pluginScansQueueEvents.on('progress', async ({ jobId, data }) => {
			const progress =
				typeof data === 'number'
					? data
					: ((data as { value?: number })?.value ?? 0);
			const envId = await this.resolveEnvId(jobId);
			this.emitJobProgress({
				jobId,
				queueName: QUEUES.PLUGIN_SCANS,
				progress,
				environmentId: envId,
			});
		});

		this.pluginScansQueueEvents.on('completed', async ({ jobId }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobCompleted({
				jobId,
				queueName: QUEUES.PLUGIN_SCANS,
				environmentId: envId,
			});
		});

		this.pluginScansQueueEvents.on(
			'failed',
			async ({ jobId, failedReason }) => {
				const envId = await this.resolveEnvId(jobId);
				this.emitJobFailed({
					jobId,
					queueName: QUEUES.PLUGIN_SCANS,
					error: failedReason,
					attempt: 1,
					environmentId: envId,
				});
			},
		);

		this.pluginScansQueueEvents.on('stalled', async ({ jobId }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobFailed({
				jobId,
				queueName: QUEUES.PLUGIN_SCANS,
				error: 'Job stalled — worker may have crashed',
				attempt: 1,
				environmentId: envId,
			});
		});

		// ── Sync queue bridge ─────────────────────────────────────────────────
		this.syncQueueEvents = new QueueEvents(QUEUES.SYNC, {
			connection: { url: redisUrl },
		});

		this.syncQueueEvents.on('progress', async ({ jobId, data }) => {
			const progress =
				typeof data === 'number'
					? data
					: ((data as { value?: number })?.value ?? 0);
			const envId = await this.resolveEnvId(jobId);
			this.emitJobProgress({
				jobId,
				queueName: QUEUES.SYNC,
				progress,
				environmentId: envId,
			});
		});

		this.syncQueueEvents.on('completed', async ({ jobId }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobCompleted({
				jobId,
				queueName: QUEUES.SYNC,
				environmentId: envId,
			});
		});

		this.syncQueueEvents.on('failed', async ({ jobId, failedReason }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobFailed({
				jobId,
				queueName: QUEUES.SYNC,
				error: failedReason,
				attempt: 1,
				environmentId: envId,
			});
		});

		this.syncQueueEvents.on('stalled', async ({ jobId }) => {
			const envId = await this.resolveEnvId(jobId);
			this.emitJobFailed({
				jobId,
				queueName: QUEUES.SYNC,
				error: 'Job stalled — worker may have crashed',
				attempt: 1,
				environmentId: envId,
			});
		});

		// ── Monitors queue bridge ─────────────────────────────────────────────
		this.monitorsQueueEvents = new QueueEvents(QUEUES.MONITORS, {
			connection: { url: redisUrl },
		});

		this.monitorsQueueEvents.on('completed', async ({ jobId }) => {
			const envId = await this.resolveMonitorEnvId(jobId);
			if (envId == null) return;
			this.emitMonitorResult({ environmentId: envId });
		});

		this.logger.log(
			'BullMQ QueueEvents bridge initialised for backups, projects, plugin-scans, sync, monitors queues',
		);
	}

	async onModuleDestroy() {
		await this.backupsQueueEvents?.close();
		await this.projectsQueueEvents?.close();
		await this.pluginScansQueueEvents?.close();
		await this.syncQueueEvents?.close();
		await this.monitorsQueueEvents?.close();
	}

	/** Look up the environmentId for a monitor bull_job_id via the monitors table. */
	private async resolveMonitorEnvId(
		bullJobId: string,
	): Promise<number | undefined> {
		try {
			// BullMQ jobId for monitors is the bull_job_id string stored in job.data or job.id.
			// The monitor processor stores monitorId in job.data — we look up via a join.
			// We can't use JobExecution for monitors (no row created). Instead use the
			// approach of checking which monitor job maps to which environment via Redis.
			// Since bullJobId == job.id and monitor job.data has { monitorId }, we cannot
			// reverse that mapping from QueueEvents alone without a lookup.
			// Best-effort: return undefined and rely on the frontend refetchInterval.
			void bullJobId;
			return undefined;
		} catch {
			return undefined;
		}
	}

	/** Look up the environmentId for a bull_job_id from the JobExecution table. */
	private async resolveEnvId(bullJobId: string): Promise<number | undefined> {
		try {
			const exec = await this.prisma.jobExecution.findFirst({
				where: { bull_job_id: bullJobId },
				select: { environment_id: true },
			});
			return exec?.environment_id ? Number(exec.environment_id) : undefined;
		} catch {
			return undefined;
		}
	}

	// ── WebSocket connection handling ─────────────────────────────────────────

	async handleConnection(socket: Socket) {
		try {
			const token =
				socket.handshake.auth?.token ??
				socket.handshake.headers?.authorization?.replace('Bearer ', '');

			if (!token) {
				socket.disconnect(true);
				return;
			}

			const payload = this.jwtService.verify(token, {
				secret: this.config.get<string>('jwt.secret'),
			});

			socket.data.userId = payload.sub;
			socket.data.roles = payload.roles; // All authenticated sockets join a shared room for events not scoped to an environment
			socket.join('global:jobs');
			this.logger.debug(`Client connected: ${socket.id} (user ${payload.sub})`);
		} catch (err) {
			this.logger.warn(`Unauthorized WebSocket connection from ${socket.id}`);
			socket.disconnect(true);
		}
	}

	handleDisconnect(socket: Socket) {
		this.logger.debug(`Client disconnected: ${socket.id}`);
	}

	@SubscribeMessage('subscribe:environment')
	async subscribeToEnvironment(
		@MessageBody() data: { environmentId: number },
		@ConnectedSocket() socket: Socket,
	) {
		const env = await this.prisma.environment.findUnique({
			where: { id: BigInt(data.environmentId) },
			select: { id: true },
		});
		if (!env) return;
		socket.join(`env:${data.environmentId}`);
	}

	@SubscribeMessage('unsubscribe:environment')
	unsubscribeFromEnvironment(
		@MessageBody() data: { environmentId: number },
		@ConnectedSocket() socket: Socket,
	) {
		socket.leave(`env:${data.environmentId}`);
	}

	// ── Emit methods ──────────────────────────────────────────────────────────

	emitJobProgress(event: JobProgressEvent) {
		const room = event.environmentId
			? `env:${event.environmentId}`
			: 'global:jobs';
		this.server.to(room).emit(WS_EVENTS.JOB_PROGRESS, event);
	}

	emitJobCompleted(event: JobCompletedEvent) {
		const room = event.environmentId
			? `env:${event.environmentId}`
			: 'global:jobs';
		this.server.to(room).emit(WS_EVENTS.JOB_COMPLETED, event);
	}

	emitJobFailed(event: JobFailedEvent) {
		const room = event.environmentId
			? `env:${event.environmentId}`
			: 'global:jobs';
		this.server.to(room).emit(WS_EVENTS.JOB_FAILED, event);
	}

	emitMonitorResult(event: Pick<MonitorResultEvent, 'environmentId'>) {
		this.server
			.to(`env:${event.environmentId}`)
			.emit(WS_EVENTS.MONITOR_RESULT, event);
	}
}
