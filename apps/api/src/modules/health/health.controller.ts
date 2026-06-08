import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  OnModuleInit,
  OnModuleDestroy,
  UseGuards,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ROLES, QUEUES } from "@bedrock-forge/shared";
import Redis from "ioredis";
import { access, constants, mkdir, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

@Controller("health")
export class HealthController implements OnModuleInit, OnModuleDestroy {
  private redisClient!: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.BACKUPS) private readonly backupsQueue: Queue,
    @InjectQueue(QUEUES.PLUGIN_SCANS) private readonly pluginScansQueue: Queue,
    @InjectQueue(QUEUES.PLUGIN_UPDATES)
    private readonly pluginUpdatesQueue: Queue,
    @InjectQueue(QUEUES.CUSTOM_PLUGINS)
    private readonly customPluginsQueue: Queue,
    @InjectQueue(QUEUES.THEME_SCANS) private readonly themeScansQueue: Queue,
    @InjectQueue(QUEUES.SYNC) private readonly syncQueue: Queue,
    @InjectQueue(QUEUES.MONITORS) private readonly monitorsQueue: Queue,
    @InjectQueue(QUEUES.DOMAINS) private readonly domainsQueue: Queue,
    @InjectQueue(QUEUES.PROJECTS) private readonly projectsQueue: Queue,
    @InjectQueue(QUEUES.SECURITY) private readonly securityQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUES.REPORTS) private readonly reportsQueue: Queue,
    @InjectQueue(QUEUES.WP_ACTIONS) private readonly wpActionsQueue: Queue,
    @InjectQueue(QUEUES.SYSTEM_BACKUPS)
    private readonly systemBackupsQueue: Queue,
  ) {}

  onModuleInit(): void {
    const url =
      this.config.get<string>("redis.url") ?? "redis://localhost:6379";
    this.redisClient = new Redis(url, {
      connectTimeout: 4000,
      commandTimeout: 4000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
    // Suppress unhandled-error events; health check uses Promise.allSettled
    this.redisClient.on("error", () => {});
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisClient.quit().catch(() => {});
  }

  /** Public minimal health check — used by load balancers and uptime monitors. */
  @Get()
  async check() {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redisClient.ping(),
    ]);

    const db = dbResult.status === "fulfilled" ? "ok" : "error";
    const redis = redisResult.status === "fulfilled" ? "ok" : "error";
    const overall = db === "ok" && redis === "ok" ? "ok" : "degraded";

    if (overall !== "ok") {
      throw new HttpException(
        { status: "degraded" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { status: "ok" };
  }

  /**
   * Admin-only detailed health report — DB latency, Redis latency, memory,
   * uptime, Node version, app version, queue depths.  Returns 503 if any
   * component is unhealthy.
   */
  @Get("details")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles(ROLES.ADMIN)
  async details() {
    const t0db = Date.now();
    const [dbResult, redisResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redisClient.ping(),
    ]);
    const dbLatencyMs = Date.now() - t0db;

    const t0redis = Date.now();
    const redisPing = await this.redisClient.ping().catch(() => null);
    const redisLatencyMs = Date.now() - t0redis;

    const queueEntries: [string, Queue][] = [
      [QUEUES.BACKUPS, this.backupsQueue],
      [QUEUES.PLUGIN_SCANS, this.pluginScansQueue],
      [QUEUES.PLUGIN_UPDATES, this.pluginUpdatesQueue],
      [QUEUES.CUSTOM_PLUGINS, this.customPluginsQueue],
      [QUEUES.THEME_SCANS, this.themeScansQueue],
      [QUEUES.SYNC, this.syncQueue],
      [QUEUES.MONITORS, this.monitorsQueue],
      [QUEUES.DOMAINS, this.domainsQueue],
      [QUEUES.PROJECTS, this.projectsQueue],
      [QUEUES.SECURITY, this.securityQueue],
      [QUEUES.NOTIFICATIONS, this.notificationsQueue],
      [QUEUES.REPORTS, this.reportsQueue],
      [QUEUES.WP_ACTIONS, this.wpActionsQueue],
      [QUEUES.SYSTEM_BACKUPS, this.systemBackupsQueue],
    ];
    const queueResults = await Promise.allSettled(
      queueEntries.map(([, queue]) => queue.getJobCounts()),
    );
    const backupStorage = await this.checkBackupStorage();

    const mem = process.memoryUsage();

    const db =
      dbResult.status === "fulfilled"
        ? { status: "ok", latency_ms: dbLatencyMs }
        : {
            status: "error",
            error:
              dbResult.status === "rejected"
                ? String(dbResult.reason)
                : "unknown",
          };

    const redis =
      redisResult.status === "fulfilled"
        ? { status: "ok", latency_ms: redisLatencyMs }
        : {
            status: "error",
            latency_ms: redisLatencyMs,
            error:
              redisResult.status === "rejected"
                ? String(redisResult.reason)
                : "unknown",
          };

    const overall =
      db.status === "ok" && redis.status === "ok" ? "ok" : "degraded";

    const payload = {
      status: overall,
      timestamp: new Date().toISOString(),
      uptime_s: Math.floor(process.uptime()),
      node_version: process.version,
      app_version: process.env.npm_package_version ?? "unknown",
      components: { db, redis: { ...redis, ping: redisPing } },
      backup_storage: backupStorage,
      memory: {
        rss_mb: Math.round(mem.rss / 1024 / 1024),
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        external_mb: Math.round(mem.external / 1024 / 1024),
      },
      queues: Object.fromEntries(
        queueEntries.map(([name], index) => [
          name,
          queueResults[index].status === "fulfilled"
            ? queueResults[index].value
            : null,
        ]),
      ),
    };

    if (overall !== "ok") {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }

  private async checkBackupStorage() {
    const path =
      this.config.get<string>("app.backupStoragePath") ?? "/var/forge/backups";
    const probe = join(path, `.health-${randomUUID()}`);
    try {
      await mkdir(path, { recursive: true });
      await access(path, constants.R_OK | constants.W_OK);
      await writeFile(probe, "ok", { mode: 0o600 });
      await unlink(probe);
      return { status: "ok", path };
    } catch (err) {
      return {
        status: "error",
        path,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
