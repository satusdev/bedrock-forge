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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
	WS_EVENTS,
	JobProgressEvent,
	JobCompletedEvent,
	JobFailedEvent,
	MonitorResultEvent,
} from '@bedrock-forge/shared';

/**
 * JobsGateway — WebSocket gateway for real-time job status updates.
 *
 * Clients connect with a JWT token in the auth handshake.
 * Once connected, they can subscribe to specific environments or jobs.
 * The worker processes publish events to Redis pub/sub; this gateway
 * broadcasts to subscribed clients.
 */
@WebSocketGateway({
	cors: { origin: '*', credentials: true },
	namespace: '/ws',
})
export class JobsGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server!: Server;

	private readonly logger = new Logger(JobsGateway.name);

	constructor(
		private readonly jwtService: JwtService,
		private readonly config: ConfigService,
	) {}

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
			socket.data.roles = payload.roles;
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
	subscribeToEnvironment(
		@MessageBody() data: { environmentId: number },
		@ConnectedSocket() socket: Socket,
	) {
		socket.join(`env:${data.environmentId}`);
	}

	@SubscribeMessage('unsubscribe:environment')
	unsubscribeFromEnvironment(
		@MessageBody() data: { environmentId: number },
		@ConnectedSocket() socket: Socket,
	) {
		socket.leave(`env:${data.environmentId}`);
	}

	// ─── Emit methods called by processors via the gateway instance ───────────

	emitJobProgress(event: JobProgressEvent) {
		if (event.environmentId) {
			this.server
				.to(`env:${event.environmentId}`)
				.emit(WS_EVENTS.JOB_PROGRESS, event);
		}
		this.server.emit(WS_EVENTS.JOB_PROGRESS, event);
	}

	emitJobCompleted(event: JobCompletedEvent) {
		if (event.environmentId) {
			this.server
				.to(`env:${event.environmentId}`)
				.emit(WS_EVENTS.JOB_COMPLETED, event);
		}
		this.server.emit(WS_EVENTS.JOB_COMPLETED, event);
	}

	emitJobFailed(event: JobFailedEvent) {
		if (event.environmentId) {
			this.server
				.to(`env:${event.environmentId}`)
				.emit(WS_EVENTS.JOB_FAILED, event);
		}
		this.server.emit(WS_EVENTS.JOB_FAILED, event);
	}

	emitMonitorResult(event: MonitorResultEvent) {
		this.server
			.to(`env:${event.environmentId}`)
			.emit(WS_EVENTS.MONITOR_RESULT, event);
	}
}
