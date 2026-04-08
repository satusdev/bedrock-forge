import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';
import {
	UpdateReportScheduleDto,
	GenerateReportDto,
	ReportScheduleConfig,
} from './dto/report-schedule.dto';

const SCHEDULE_KEY = 'report_weekly_schedule';
const REPEATABLE_JOB_NAME = 'weekly-report';

@Injectable()
export class ReportsService implements OnModuleInit {
	private readonly logger = new Logger(ReportsService.name);

	constructor(
		private readonly settings: SettingsService,
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
		@InjectQueue(QUEUES.REPORTS) private readonly reportsQueue: Queue,
	) {}

	async onModuleInit() {
		// Re-register repeatable job if schedule was previously configured
		try {
			const stored = await this.settings.get(SCHEDULE_KEY);
			if (stored) {
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
		return s ? (JSON.parse(s.value) as ReportScheduleConfig) : null;
	}

	async updateConfig(
		dto: UpdateReportScheduleDto,
	): Promise<ReportScheduleConfig> {
		const config: ReportScheduleConfig = {
			enabled: dto.enabled,
			day_of_week: dto.day_of_week,
			hour: dto.hour,
			minute: dto.minute,
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
			this.logger.log('Weekly report schedule disabled');
		}

		return config;
	}

	async generateNow(dto: GenerateReportDto = {}): Promise<{ jobId: string }> {
		const job = await this.reportsQueue.add(
			JOB_TYPES.REPORT_GENERATE,
			{
				period: dto.period ?? 'last_7d',
				channelIds: dto.channelIds ?? null,
			},
			{ attempts: 1, removeOnComplete: 10, removeOnFail: 10 },
		);
		return { jobId: String(job.id) };
	}

	async getHistory() {
		const rows = await this.prisma.jobExecution.findMany({
			where: { queue_name: QUEUES.REPORTS },
			orderBy: { created_at: 'desc' },
			take: 50,
			select: {
				id: true,
				bull_job_id: true,
				job_type: true,
				status: true,
				progress: true,
				last_error: true,
				payload: true,
				execution_log: true,
				started_at: true,
				completed_at: true,
				created_at: true,
			},
		});
		// BigInt IDs need to be serialised
		return rows.map(r => ({ ...r, id: String(r.id) }));
	}

	async getAvailableChannels() {
		const channels = await this.prisma.notificationChannel.findMany({
			where: { active: true, events: { has: 'report.weekly' } },
			orderBy: { name: 'asc' },
		});
		return channels.map(c => ({
			id: Number(c.id),
			name: c.name,
			slack_channel_id: c.slack_channel_id,
			has_token: !!c.slack_bot_token_enc,
			active: c.active,
		}));
	}

	// ── private helpers ──────────────────────────────────────────────────────

	private toCron(c: ReportScheduleConfig): string {
		// "minute hour * * day_of_week" e.g. "0 9 * * 1" = Monday 09:00
		return `${c.minute} ${c.hour} * * ${c.day_of_week}`;
	}

	private async registerRepeatableJob(config: ReportScheduleConfig) {
		await this.reportsQueue.add(
			JOB_TYPES.REPORT_GENERATE,
			{},
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
