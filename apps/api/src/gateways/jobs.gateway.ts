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
  private backupsQueueEvents!: QueueEvents;
  private projectsQueueEvents!: QueueEvents;
  private pluginScansQueueEvents!: QueueEvents;
  private syncQueueEvents!: QueueEvents;
  private monitorsQueueEvents!: QueueEvents;
  private securityQueueEvents!: QueueEvents;
  private themeScansQueueEvents!: QueueEvents;
  private wpActionsQueueEvents!: QueueEvents;
  private customPluginsQueueEvents!: QueueEvents;
  private systemBackupsQueueEvents!: QueueEvents;
  private pluginUpdatesQueueEvents!: QueueEvents;
  private notificationsQueueEvents!: QueueEvents;
  private domainsQueueEvents!: QueueEvents;
  private reportsQueueEvents!: QueueEvents;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly jobExecutions: JobExecutionsService,
    private readonly envService: EnvironmentsService,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onModuleInit() {
    const redisUrl = this.config.get<string>("redis.url")!;
    this.backupsQueueEvents = new QueueEvents(QUEUES.BACKUPS, {
      connection: { url: redisUrl },
    });

    this.backupsQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
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

    this.backupsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.BACKUPS,
        environmentId: envId,
      });
    });

    this.backupsQueueEvents.on("failed", async ({ jobId, failedReason }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.BACKUPS,
        error: failedReason,
        attempt: 1,
        environmentId: envId,
      });
    });

    this.backupsQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.BACKUPS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Projects queue bridge ──────────────────────────────────────────────
    this.projectsQueueEvents = new QueueEvents(QUEUES.PROJECTS, {
      connection: { url: redisUrl },
    });

    this.projectsQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
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

    this.projectsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.PROJECTS,
        environmentId: envId,
      });
    });

    this.projectsQueueEvents.on("failed", async ({ jobId, failedReason }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.PROJECTS,
        error: failedReason,
        attempt: 1,
        environmentId: envId,
      });
    });

    this.projectsQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.PROJECTS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Plugin scans queue bridge ────────────────────────────────────────────
    this.pluginScansQueueEvents = new QueueEvents(QUEUES.PLUGIN_SCANS, {
      connection: { url: redisUrl },
    });

    this.pluginScansQueueEvents.on("progress", async ({ jobId, data }) => {
      const progress =
        typeof data === "number"
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

    this.pluginScansQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.PLUGIN_SCANS,
        environmentId: envId,
      });
    });

    this.pluginScansQueueEvents.on(
      "failed",
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

    this.pluginScansQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.PLUGIN_SCANS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Sync queue bridge ─────────────────────────────────────────────────
    this.syncQueueEvents = new QueueEvents(QUEUES.SYNC, {
      connection: { url: redisUrl },
    });

    this.syncQueueEvents.on("progress", async ({ jobId, data }) => {
      const progress =
        typeof data === "number"
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

    this.syncQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.SYNC,
        environmentId: envId,
      });
    });

    this.syncQueueEvents.on("failed", async ({ jobId, failedReason }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.SYNC,
        error: failedReason,
        attempt: 1,
        environmentId: envId,
      });
    });

    this.syncQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.SYNC,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Monitors queue bridge ─────────────────────────────────────────────
    this.monitorsQueueEvents = new QueueEvents(QUEUES.MONITORS, {
      connection: { url: redisUrl },
    });

    this.monitorsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveMonitorEnvId(jobId);
      if (envId == null) return;
      this.emitMonitorResult({ environmentId: envId });
    });

    // ── Security queue bridge ─────────────────────────────────────────────
    this.securityQueueEvents = new QueueEvents(QUEUES.SECURITY, {
      connection: { url: redisUrl },
    });
    this.securityQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.SECURITY,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.securityQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.SECURITY,
        environmentId: envId,
      });
    });
    this.securityQueueEvents.on("failed", async ({ jobId, failedReason }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.SECURITY,
        error: failedReason,
        attempt: 1,
        environmentId: envId,
      });
    });
    this.securityQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.SECURITY,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Theme scans queue bridge ──────────────────────────────────────────
    this.themeScansQueueEvents = new QueueEvents(QUEUES.THEME_SCANS, {
      connection: { url: redisUrl },
    });
    this.themeScansQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.THEME_SCANS,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.themeScansQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.THEME_SCANS,
        environmentId: envId,
      });
    });
    this.themeScansQueueEvents.on("failed", async ({ jobId, failedReason }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.THEME_SCANS,
        error: failedReason,
        attempt: 1,
        environmentId: envId,
      });
    });
    this.themeScansQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.THEME_SCANS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── WP actions queue bridge ───────────────────────────────────────────
    this.wpActionsQueueEvents = new QueueEvents(QUEUES.WP_ACTIONS, {
      connection: { url: redisUrl },
    });
    this.wpActionsQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.WP_ACTIONS,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.wpActionsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.WP_ACTIONS,
        environmentId: envId,
      });
    });
    this.wpActionsQueueEvents.on("failed", async ({ jobId, failedReason }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.WP_ACTIONS,
        error: failedReason,
        attempt: 1,
        environmentId: envId,
      });
    });
    this.wpActionsQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.WP_ACTIONS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Custom plugins queue bridge ───────────────────────────────────────
    this.customPluginsQueueEvents = new QueueEvents(QUEUES.CUSTOM_PLUGINS, {
      connection: { url: redisUrl },
    });
    this.customPluginsQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.CUSTOM_PLUGINS,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.customPluginsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.CUSTOM_PLUGINS,
        environmentId: envId,
      });
    });
    this.customPluginsQueueEvents.on(
      "failed",
      async ({ jobId, failedReason }) => {
        const envId = await this.resolveEnvId(jobId);
        this.emitJobFailed({
          jobId,
          queueName: QUEUES.CUSTOM_PLUGINS,
          error: failedReason,
          attempt: 1,
          environmentId: envId,
        });
      },
    );
    this.customPluginsQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.CUSTOM_PLUGINS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── System backups queue bridge ───────────────────────────────────────
    this.systemBackupsQueueEvents = new QueueEvents(QUEUES.SYSTEM_BACKUPS, {
      connection: { url: redisUrl },
    });
    this.systemBackupsQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.SYSTEM_BACKUPS,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.systemBackupsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.SYSTEM_BACKUPS,
        environmentId: envId,
      });
    });
    this.systemBackupsQueueEvents.on(
      "failed",
      async ({ jobId, failedReason }) => {
        const envId = await this.resolveEnvId(jobId);
        this.emitJobFailed({
          jobId,
          queueName: QUEUES.SYSTEM_BACKUPS,
          error: failedReason,
          attempt: 1,
          environmentId: envId,
        });
      },
    );
    this.systemBackupsQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.SYSTEM_BACKUPS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Plugin updates queue bridge ───────────────────────────────────────
    this.pluginUpdatesQueueEvents = new QueueEvents(QUEUES.PLUGIN_UPDATES, {
      connection: { url: redisUrl },
    });
    this.pluginUpdatesQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.PLUGIN_UPDATES,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.pluginUpdatesQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.PLUGIN_UPDATES,
        environmentId: envId,
      });
    });
    this.pluginUpdatesQueueEvents.on(
      "failed",
      async ({ jobId, failedReason }) => {
        const envId = await this.resolveEnvId(jobId);
        this.emitJobFailed({
          jobId,
          queueName: QUEUES.PLUGIN_UPDATES,
          error: failedReason,
          attempt: 1,
          environmentId: envId,
        });
      },
    );
    this.pluginUpdatesQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.PLUGIN_UPDATES,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Notifications queue bridge ────────────────────────────────────────
    this.notificationsQueueEvents = new QueueEvents(QUEUES.NOTIFICATIONS, {
      connection: { url: redisUrl },
    });
    this.notificationsQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.NOTIFICATIONS,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.notificationsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.NOTIFICATIONS,
        environmentId: envId,
      });
    });
    this.notificationsQueueEvents.on(
      "failed",
      async ({ jobId, failedReason }) => {
        const envId = await this.resolveEnvId(jobId);
        this.emitJobFailed({
          jobId,
          queueName: QUEUES.NOTIFICATIONS,
          error: failedReason,
          attempt: 1,
          environmentId: envId,
        });
      },
    );
    this.notificationsQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.NOTIFICATIONS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Domains queue bridge ──────────────────────────────────────────────
    this.domainsQueueEvents = new QueueEvents(QUEUES.DOMAINS, {
      connection: { url: redisUrl },
    });
    this.domainsQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.DOMAINS,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.domainsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.DOMAINS,
        environmentId: envId,
      });
    });
    this.domainsQueueEvents.on("failed", async ({ jobId, failedReason }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.DOMAINS,
        error: failedReason,
        attempt: 1,
        environmentId: envId,
      });
    });
    this.domainsQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.DOMAINS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    // ── Reports queue bridge ──────────────────────────────────────────────
    this.reportsQueueEvents = new QueueEvents(QUEUES.REPORTS, {
      connection: { url: redisUrl },
    });
    this.reportsQueueEvents.on("progress", async ({ jobId, data }) => {
      const isObj = typeof data === "object" && data !== null;
      const progress =
        typeof data === "number"
          ? data
          : ((data as { value?: number })?.value ?? 0);
      const step = isObj ? (data as { step?: string })?.step : undefined;
      const envId = await this.resolveEnvId(jobId);
      this.emitJobProgress({
        jobId,
        queueName: QUEUES.REPORTS,
        progress,
        step,
        environmentId: envId,
      });
    });
    this.reportsQueueEvents.on("completed", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobCompleted({
        jobId,
        queueName: QUEUES.REPORTS,
        environmentId: envId,
      });
    });
    this.reportsQueueEvents.on("failed", async ({ jobId, failedReason }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.REPORTS,
        error: failedReason,
        attempt: 1,
        environmentId: envId,
      });
    });
    this.reportsQueueEvents.on("stalled", async ({ jobId }) => {
      const envId = await this.resolveEnvId(jobId);
      this.emitJobFailed({
        jobId,
        queueName: QUEUES.REPORTS,
        error: "Job stalled — worker may have crashed",
        attempt: 1,
        environmentId: envId,
      });
    });

    this.logger.log("BullMQ QueueEvents bridge initialised for all 14 queues");
  }

  async onModuleDestroy() {
    await this.backupsQueueEvents?.close();
    await this.projectsQueueEvents?.close();
    await this.pluginScansQueueEvents?.close();
    await this.syncQueueEvents?.close();
    await this.monitorsQueueEvents?.close();
    await this.securityQueueEvents?.close();
    await this.themeScansQueueEvents?.close();
    await this.wpActionsQueueEvents?.close();
    await this.customPluginsQueueEvents?.close();
    await this.systemBackupsQueueEvents?.close();
    await this.pluginUpdatesQueueEvents?.close();
    await this.notificationsQueueEvents?.close();
    await this.domainsQueueEvents?.close();
    await this.reportsQueueEvents?.close();
  }

  /** Look up the environmentId for a monitor check job via matching JobExecution rows.
   * The monitor processor creates a JobExecution row at the start of each check
   * with queue_name='monitors' and bull_job_id=job.id — we use that to reverse-map.
   */
  private async resolveMonitorEnvId(
    bullJobId: string,
  ): Promise<number | undefined> {
    return this.jobExecutions.findEnvIdByBullJobId(bullJobId, "monitors");
  }

  /** Look up the environmentId for a bull_job_id from the JobExecution table. */
  private async resolveEnvId(bullJobId: string): Promise<number | undefined> {
    return this.jobExecutions.findEnvIdByBullJobId(bullJobId);
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
      socket.data.roles = payload.roles; // All authenticated sockets join a shared room for events not scoped to an environment
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
    const room = event.environmentId
      ? `env:${event.environmentId}`
      : "global:jobs";
    this.server.to(room).emit(WS_EVENTS.JOB_PROGRESS, event);
  }

  emitJobCompleted(event: JobCompletedEvent) {
    const room = event.environmentId
      ? `env:${event.environmentId}`
      : "global:jobs";
    this.server.to(room).emit(WS_EVENTS.JOB_COMPLETED, event);
  }

  emitJobFailed(event: JobFailedEvent) {
    const room = event.environmentId
      ? `env:${event.environmentId}`
      : "global:jobs";
    this.server.to(room).emit(WS_EVENTS.JOB_FAILED, event);
  }

  emitMonitorResult(event: Pick<MonitorResultEvent, "environmentId">) {
    this.server
      .to(`env:${event.environmentId}`)
      .emit(WS_EVENTS.MONITOR_RESULT, event);
  }
}
