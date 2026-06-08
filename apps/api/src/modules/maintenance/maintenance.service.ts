import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { readdir, rm, stat } from "fs/promises";
import { join } from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { CleanupSchedulesRepository } from "../cleanup-schedules/cleanup-schedules.repository";
import { WpActionsService } from "../wp-actions/wp-actions.service";

const STAGING_DIR = "/tmp/forge-backups";
const ORPHAN_TTL_MS = 24 * 60 * 60 * 1_000;

/**
 * MaintenanceService
 *
 * Runs nightly cleanup jobs to prevent unbounded table growth:
 * - Expired / revoked refresh tokens
 * - Notification logs older than 90 days
 * - Audit logs older than 180 days
 * - Completed/failed JobExecution records older than 90 days
 *
 * Also:
 * - On startup: sweeps crash-orphaned backup staging directories
 * - Hourly: fires wp:cleanup jobs for environments with an active CleanupSchedule
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cleanupRepo: CleanupSchedulesRepository,
    private readonly wpActions: WpActionsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverInterruptedJobs();
    await this.sweepOrphanedStagingDirs();
  }

  private async recoverInterruptedJobs(): Promise<void> {
    try {
      const recovered = await this.prisma.jobExecution.updateMany({
        where: { status: "active" },
        data: {
          status: "failed",
          last_error: "Process interrupted — forge was restarted",
          completed_at: new Date(),
        },
      });
      if (recovered.count > 0) {
        this.logger.warn(
          `Startup recovery: marked ${recovered.count} interrupted job(s) as failed`,
        );
      }
    } catch (e) {
      this.logger.error("Startup recovery failed", e);
    }
  }

  /**
   * Delete subdirectories under /tmp/forge-backups that are older than 24 hours.
   * These are left behind when the container crashes mid-backup before the
   * per-job cleanup runs.
   */
  private async sweepOrphanedStagingDirs(): Promise<void> {
    try {
      const cutoff = Date.now() - ORPHAN_TTL_MS;
      const entries = await readdir(STAGING_DIR, { withFileTypes: true }).catch(
        () => [],
      );
      let swept = 0;
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dirPath = join(STAGING_DIR, entry.name);
        const { mtimeMs } = await stat(dirPath);
        if (mtimeMs < cutoff) {
          await rm(dirPath, { recursive: true, force: true });
          swept++;
        }
      }
      if (swept > 0) {
        this.logger.warn(
          `Startup sweep: removed ${swept} orphaned backup staging dir(s) from ${STAGING_DIR}`,
        );
      }
    } catch (e) {
      this.logger.error("Staging directory sweep failed", e);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runCleanup(): Promise<void> {
    this.logger.log("Starting nightly maintenance cleanup");

    const now = new Date();
    const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000);
    const days180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1_000);

    const results = await Promise.allSettled([
      // Expired or revoked refresh tokens
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expires_at: { lt: now } }, { revoked_at: { not: null } }],
        },
      }),
      // Old notification logs
      this.prisma.notificationLog.deleteMany({
        where: { created_at: { lt: days90 } },
      }),
      // Old audit logs
      this.prisma.auditLog.deleteMany({
        where: { created_at: { lt: days180 } },
      }),
      // Completed / failed job executions — keep 90 days for debugging
      this.prisma.jobExecution.deleteMany({
        where: {
          status: { in: ["completed", "failed", "dead_letter"] },
          completed_at: { lt: days90 },
        },
      }),
      // In-app user notifications — unbounded without a TTL
      this.prisma.userNotification.deleteMany({
        where: { created_at: { lt: days90 } },
      }),
    ]);

    const labels = [
      "refresh tokens",
      "notification logs",
      "audit logs",
      "job executions",
      "user notifications",
    ];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        this.logger.log(`Maintenance: deleted ${r.value.count} ${labels[i]}`);
      } else {
        this.logger.error(
          `Maintenance: failed to clean ${labels[i]}`,
          r.reason,
        );
      }
    });
  }

  /**
   * Runs every hour. For each enabled CleanupSchedule whose frequency/hour/day
   * matches now (and whose last_run_at is far enough in the past), dispatches
   * a wp:cleanup job and records the run timestamp.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runCleanupSchedules(): Promise<void> {
    const schedules = await this.cleanupRepo.findAllEnabled();
    if (schedules.length === 0) return;

    const now = new Date();
    for (const schedule of schedules) {
      if (!this.shouldFire(schedule, now)) continue;
      const envId = Number(schedule.environment_id);
      try {
        await this.wpActions.enqueueCleanup(
          envId,
          false,
          schedule.keep_revisions,
        );
        await this.cleanupRepo.updateLastRun(schedule.environment_id, now);
        this.logger.log(
          `CleanupSchedule: dispatched wp:cleanup for env ${envId} (keep_revisions=${schedule.keep_revisions})`,
        );
      } catch (e) {
        this.logger.error(
          `CleanupSchedule: failed to dispatch for env ${envId}`,
          e,
        );
      }
    }
  }

  private shouldFire(
    schedule: {
      frequency: string;
      hour: number;
      minute: number;
      day_of_week: number | null;
      day_of_month: number | null;
      last_run_at: Date | null;
    },
    now: Date,
  ): boolean {
    if (schedule.hour !== now.getUTCHours()) return false;
    if (schedule.minute !== now.getUTCMinutes()) return false;

    const elapsed = schedule.last_run_at
      ? now.getTime() - schedule.last_run_at.getTime()
      : Infinity;

    switch (schedule.frequency) {
      case "daily":
        return elapsed >= 20 * 60 * 60 * 1_000;
      case "weekly":
        if (
          schedule.day_of_week !== null &&
          schedule.day_of_week !== now.getUTCDay()
        )
          return false;
        return elapsed >= 6 * 24 * 60 * 60 * 1_000;
      case "monthly":
        if (
          schedule.day_of_month !== null &&
          schedule.day_of_month !== now.getUTCDate()
        )
          return false;
        return elapsed >= 28 * 24 * 60 * 60 * 1_000;
      default:
        return false;
    }
  }
}
