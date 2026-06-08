import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { QUEUES, JOB_TYPES } from "@bedrock-forge/shared";
import { SystemBackupsRepository } from "./system-backups.repository";
import { UpsertSystemBackupScheduleDto } from "./system-backup-schedule.dto";

@Injectable()
export class SystemBackupScheduleService {
  private readonly logger = new Logger(SystemBackupScheduleService.name);

  constructor(
    private readonly repo: SystemBackupsRepository,
    @InjectQueue(QUEUES.SYSTEM_BACKUPS) private readonly queue: Queue,
  ) {}

  findSchedule() {
    return this.repo.findSchedule();
  }

  async upsert(dto: UpsertSystemBackupScheduleDto) {
    const schedule = await this.repo.upsertSchedule({
      frequency: dto.frequency,
      hour: dto.hour,
      minute: dto.minute,
      day_of_week: dto.day_of_week ?? null,
      day_of_month: dto.day_of_month ?? null,
      enabled: dto.enabled,
      retention_count: dto.retention_count ?? null,
      retention_days: dto.retention_days ?? null,
    });

    await this.syncRepeatableJob(Number(schedule.id), dto);
    return schedule;
  }

  async remove() {
    const schedule = await this.repo.findSchedule();
    if (schedule) {
      await this.removeRepeatableJob(Number(schedule.id));
    }
    await this.repo.deleteSchedule();
  }

  // ── BullMQ repeatable job management ────────────────────────────────────

  private buildCronPattern(
    dto: Pick<
      UpsertSystemBackupScheduleDto,
      "frequency" | "hour" | "minute" | "day_of_week" | "day_of_month"
    >,
  ): string {
    switch (dto.frequency) {
      case "hourly":
        return `${dto.minute} * * * *`;
      case "daily":
        return `${dto.minute} ${dto.hour} * * *`;
      case "weekly":
        return `${dto.minute} ${dto.hour} * * ${dto.day_of_week ?? 0}`;
      case "monthly":
        return `${dto.minute} ${dto.hour} ${dto.day_of_month ?? 1} * *`;
      default:
        throw new Error(`Unknown frequency: ${dto.frequency}`);
    }
  }

  private repeatableJobId(scheduleId: number): string {
    return `system-backup-schedule-${scheduleId}`;
  }

  private async syncRepeatableJob(
    scheduleId: number,
    dto: UpsertSystemBackupScheduleDto,
  ) {
    // Remove existing repeatable job first (idempotent)
    await this.removeRepeatableJob(scheduleId);

    if (!dto.enabled) {
      this.logger.log(
        `SystemBackupSchedule ${scheduleId} disabled — repeatable job removed`,
      );
      return;
    }

    const pattern = this.buildCronPattern(dto);
    const jobId = this.repeatableJobId(scheduleId);

    this.logger.log(
      `Registering system-backup repeatable job ${jobId} with cron ${pattern}`,
    );

    await this.queue.add(
      JOB_TYPES.SYSTEM_BACKUP_SCHEDULED,
      { scheduleId },
      {
        jobId,
        repeat: { pattern },
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );
  }

  private async removeRepeatableJob(scheduleId: number) {
    const jobId = this.repeatableJobId(scheduleId);
    try {
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const rj of repeatableJobs) {
        if (rj.id === jobId) {
          await this.queue.removeRepeatableByKey(rj.key);
          this.logger.log(`Removed repeatable job key: ${rj.key}`);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Could not remove system-backup repeatable job for schedule ${scheduleId}: ${err}`,
      );
    }
  }
}
