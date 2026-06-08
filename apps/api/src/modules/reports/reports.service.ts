import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { SettingsService } from "../settings/settings.service";
import { ReportsRepository } from "./reports.repository";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { QUEUES, JOB_TYPES } from "@bedrock-forge/shared";
import {
  UpdateReportScheduleDto,
  GenerateReportDto,
  ReportScheduleConfig,
} from "./dto/report-schedule.dto";

const SCHEDULE_KEY = "report_weekly_schedule";
const REPEATABLE_JOB_NAME = "weekly-report";

@Injectable()
export class ReportsService implements OnModuleInit {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly repo: ReportsRepository,
    private readonly encryption: EncryptionService,
    @InjectQueue(QUEUES.REPORTS) private readonly reportsQueue: Queue,
  ) {}

  async onModuleInit() {
    // Re-register repeatable job if schedule was previously configured
    try {
      const stored = await this.settings.get(SCHEDULE_KEY);
      if (stored && stored.value) {
        const config = JSON.parse(stored.value) as ReportScheduleConfig;
        if (config.enabled) {
          await this.registerRepeatableJob(config);
          this.logger.log(
            `Weekly report scheduler loaded: ${this.toCron(config)}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to restore report schedule: ${err}`);
    }
  }

  async getConfig(): Promise<ReportScheduleConfig | null> {
    const s = await this.settings.get(SCHEDULE_KEY);
    return s?.value ? (JSON.parse(s.value) as ReportScheduleConfig) : null;
  }

  async updateConfig(
    dto: UpdateReportScheduleDto,
  ): Promise<ReportScheduleConfig> {
    const config: ReportScheduleConfig = {
      enabled: dto.enabled,
      day_of_week: dto.day_of_week,
      hour: dto.hour,
      minute: dto.minute,
      period: dto.period ?? "last_7d",
    };

    // Persist to AppSetting
    await this.settings.set(SCHEDULE_KEY, JSON.stringify(config));

    // Remove existing repeatable job(s) for this report
    await this.removeRepeatableJob();

    // Register a new repeatable job if enabled
    if (config.enabled) {
      await this.registerRepeatableJob(config);
      this.logger.log(`Weekly report scheduled: ${this.toCron(config)}`);
    } else {
      this.logger.log("Weekly report schedule disabled");
    }

    return config;
  }

  async generateNow(dto: GenerateReportDto = {}): Promise<{ jobId: string }> {
    const job = await this.reportsQueue.add(
      JOB_TYPES.REPORT_GENERATE,
      {
        period: dto.period ?? "last_7d",
        channelIds: dto.channelIds ?? null,
      },
      { attempts: 1, removeOnComplete: 10, removeOnFail: 10 },
    );
    return { jobId: String(job.id) };
  }

  async getHistory() {
    return this.repo.findHistory();
  }

  async getAvailableChannels() {
    return this.repo.findAvailableChannels();
  }

  async toggleChannelSubscription(
    id: number,
    subscribed: boolean,
  ): Promise<{ id: number; name: string; subscribed: boolean }> {
    const channel = await this.repo.findChannelById(id);
    if (!channel) throw new Error(`Channel ${id} not found`);

    const events = channel.events.filter((e) => e !== "report.weekly");
    if (subscribed) events.push("report.weekly");

    return this.repo.updateChannelEvents(id, events);
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private toCron(c: ReportScheduleConfig): string {
    // "minute hour * * day_of_week" e.g. "0 9 * * 1" = Monday 09:00
    return `${c.minute} ${c.hour} * * ${c.day_of_week}`;
  }

  private async registerRepeatableJob(config: ReportScheduleConfig) {
    await this.reportsQueue.add(
      JOB_TYPES.REPORT_GENERATE,
      { period: config.period ?? "last_7d" },
      {
        repeat: { pattern: this.toCron(config) },
        jobId: REPEATABLE_JOB_NAME,
        attempts: 2,
        removeOnComplete: 5,
        removeOnFail: 10,
      },
    );
  }

  private async removeRepeatableJob() {
    try {
      const repeatableJobs = await this.reportsQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === JOB_TYPES.REPORT_GENERATE) {
          await this.reportsQueue.removeRepeatableByKey(job.key);
        }
      }
    } catch {
      // Ignore if nothing to remove
    }
  }
}
