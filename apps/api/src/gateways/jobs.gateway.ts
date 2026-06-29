import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { QueueEvents } from "bullmq";
import { JobExecutionsService } from "../modules/job-executions/job-executions.service";
import { EnvironmentsService } from "../modules/environments/environments.service";
import {
  WS_EVENTS,
  QUEUES,
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
  MonitorResultEvent,
} from "@bedrock-forge/shared";

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
  cors: {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:8080",
    credentials: true,
  },
  namespace: "/ws",
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
  private readonly queueEventsInstances: QueueEvents[] = [];
  private readonly envIdCache = new Map<string, number | undefined>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly jobExecutions: JobExecutionsService,
    private readonly envService: EnvironmentsService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onModuleInit() {
    const redisUrl = this.config.get<string>("redis.url")!;
    const standardQueues: string[] = Object.values(QUEUES);

    for (const queueName of standardQueues) {
      const qe = new QueueEvents(queueName, {
        connection: { url: redisUrl },
      });

      qe.on("progress", async ({ jobId, data }) => {
        if (queueName === QUEUES.MONITORS && !jobId.startsWith("lighthouse-")) {
          return;
        }

        const isObj = typeof data === "object" && data !== null;
        const progress =
          typeof data === "number"
            ? data
            : ((data as { value?: number })?.value ?? 0);
        const step = isObj ? (data as { step?: string })?.step : undefined;
        const envId = await this.resolveEnvId(jobId);

        // Update database with latest progress
        await this.jobExecutions
          .updateProgressByBullJobId(jobId, queueName, progress)
          .catch((err) => {
            this.logger.error(
              `Failed to update progress for ${jobId} in queue ${queueName}: ${err.message}`,
            );
          });

        this.emitJobProgress({
          jobId,
          queueName,
          progress,
          step,
          environmentId: envId,
        });
      });

      qe.on("completed", async ({ jobId }) => {
        if (queueName === QUEUES.MONITORS) {
          if (jobId.startsWith("lighthouse-")) {
            const envId = await this.resolveEnvId(jobId);
            this.emitJobCompleted({
              jobId,
              queueName,
              environmentId: envId,
            });
            this.envIdCache.delete(jobId);
          } else {
            const envId = await this.resolveMonitorEnvId(jobId);
            if (envId != null) {
              this.emitMonitorResult({ environmentId: envId });
            }
          }
          return;
        }

        const envId = await this.resolveEnvId(jobId);

        // Fallback status update in case worker missed it
        await this.jobExecutions
          .updateStatusByBullJobId(jobId, queueName, "completed")
          .catch((err) => {
            this.logger.error(
              `Failed to update completed status for ${jobId} in queue ${queueName}: ${err.message}`,
            );
          });

        this.emitJobCompleted({
          jobId,
          queueName,
          environmentId: envId,
        });
        this.envIdCache.delete(jobId);
      });

      qe.on("failed", async ({ jobId, failedReason }) => {
        if (queueName === QUEUES.MONITORS && !jobId.startsWith("lighthouse-")) {
          return;
        }

        const envId = await this.resolveEnvId(jobId);

        await this.jobExecutions
          .updateStatusByBullJobId(
            jobId,
            queueName,
            "failed",
            failedReason || "Job execution failed",
          )
          .catch((err) => {
            this.logger.error(
              `Failed to update job execution status for ${jobId} in queue ${queueName} on failed: ${err.message}`,
            );
          });

        this.emitJobFailed({
          jobId,
          queueName,
          error: failedReason,
          attempt: 1,
          environmentId: envId,
        });
        this.envIdCache.delete(jobId);
      });

      qe.on("stalled", async ({ jobId }) => {
        if (queueName === QUEUES.MONITORS && !jobId.startsWith("lighthouse-")) {
          return;
        }

        const envId = await this.resolveEnvId(jobId);
        const errorMsg = "Job stalled — worker may have crashed";

        await this.jobExecutions
          .updateStatusByBullJobId(jobId, queueName, "failed", errorMsg)
          .catch((err) => {
            this.logger.error(
              `Failed to update job execution status for stalled ${jobId} in queue ${queueName}: ${err.message}`,
            );
          });

        this.emitJobFailed({
          jobId,
          queueName,
          error: errorMsg,
          attempt: 1,
          environmentId: envId,
        });
        this.envIdCache.delete(jobId);
      });

      this.queueEventsInstances.push(qe);
    }

    this.logger.log(`BullMQ QueueEvents bridge initialised for all ${standardQueues.length} queues`);
  }

  async onModuleDestroy() {
    await Promise.all(
      this.queueEventsInstances.map((qe) => qe.close().catch(() => {})),
    );
  }

  private async resolveMonitorEnvId(
    bullJobId: string,
  ): Promise<number | undefined> {
    return this.jobExecutions.findEnvIdByBullJobId(bullJobId, "monitors");
  }

  private async resolveEnvId(bullJobId: string): Promise<number | undefined> {
    if (this.envIdCache.has(bullJobId)) {
      return this.envIdCache.get(bullJobId);
    }
    const envId = await this.jobExecutions.findEnvIdByBullJobId(bullJobId);
    if (this.envIdCache.size >= 1000) {
      const firstKey = this.envIdCache.keys().next().value;
      if (firstKey !== undefined) {
        this.envIdCache.delete(firstKey);
      }
    }
    this.envIdCache.set(bullJobId, envId);
    return envId;
  }

  // ── WebSocket connection handling ─────────────────────────────────────────

  async handleConnection(socket: Socket) {
    try {
      const token =
        socket.handshake.auth?.token ??
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        socket.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>("jwt.secret"),
      });

      socket.data.userId = payload.sub;
      socket.data.roles = payload.roles;
      socket.join("global:jobs");
      this.logger.debug(`Client connected: ${socket.id} (user ${payload.sub})`);
    } catch (err) {
      this.logger.warn(`Unauthorized WebSocket connection from ${socket.id}`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    this.logger.debug(`Client disconnected: ${socket.id}`);
  }

  @SubscribeMessage("subscribe:environment")
  async subscribeToEnvironment(
    @MessageBody() data: { environmentId: number },
    @ConnectedSocket() socket: Socket,
  ) {
    const exists = await this.envService.existsById(BigInt(data.environmentId));
    if (!exists) return;
    socket.join(`env:${data.environmentId}`);
  }

  @SubscribeMessage("unsubscribe:environment")
  unsubscribeFromEnvironment(
    @MessageBody() data: { environmentId: number },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.leave(`env:${data.environmentId}`);
  }

  // ── Emit methods ──────────────────────────────────────────────────────────

  emitJobProgress(event: JobProgressEvent) {
    this.server.to("global:jobs").emit(WS_EVENTS.JOB_PROGRESS, event);
    if (event.environmentId) {
      this.server
        .to(`env:${event.environmentId}`)
        .emit(WS_EVENTS.JOB_PROGRESS, event);
    }
  }

  emitJobCompleted(event: JobCompletedEvent) {
    this.server.to("global:jobs").emit(WS_EVENTS.JOB_COMPLETED, event);
    if (event.environmentId) {
      this.server
        .to(`env:${event.environmentId}`)
        .emit(WS_EVENTS.JOB_COMPLETED, event);
    }
  }

  emitJobFailed(event: JobFailedEvent) {
    this.server.to("global:jobs").emit(WS_EVENTS.JOB_FAILED, event);
    if (event.environmentId) {
      this.server
        .to(`env:${event.environmentId}`)
        .emit(WS_EVENTS.JOB_FAILED, event);
    }
  }

  emitMonitorResult(event: Pick<MonitorResultEvent, "environmentId">) {
    this.server
      .to(`env:${event.environmentId}`)
      .emit(WS_EVENTS.MONITOR_RESULT, event);
  }
}
