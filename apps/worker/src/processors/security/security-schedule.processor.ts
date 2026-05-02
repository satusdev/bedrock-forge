import { InjectQueue } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';

/** Fires every 15 minutes to check which security schedules are due. */
const TICK_JOB_ID = 'security-schedule-tick';
const TICK_EVERY_MS = 15 * 60 * 1_000;

export class SecurityScheduleProcessor implements OnApplicationBootstrap {
	private readonly logger = new Logger(SecurityScheduleProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.SECURITY) private readonly securityQueue: Queue,
	) {}

	async onApplicationBootstrap() {
		// Register (or re-register) a repeatable tick job so it survives restarts.
		await this.securityQueue.add(
			JOB_TYPES.SECURITY_SCHEDULED_SCAN,
			{},
			{
				repeat: { every: TICK_EVERY_MS },
				jobId: TICK_JOB_ID,
				removeOnComplete: 10,
				removeOnFail: 5,
			},
		);
		this.logger.log('Security schedule tick registered (every 15 min)');
	}

	// Tick scheduling has moved to SecurityScanProcessor (security-server-scan.processor.ts).
	async process(job: Job) {
		if (job.name !== JOB_TYPES.SECURITY_SCHEDULED_SCAN) return;

		const now = new Date();
		const schedules = await this.prisma.securityScanSchedule.findMany({
			where: { enabled: true },
		});

		this.logger.debug(
			`Schedule tick: checking ${schedules.length} enabled schedule(s)`,
		);

		for (const schedule of schedules) {
			if (!this.isDue(schedule, now)) continue;

			try {
				if (schedule.server_id) {
					const scanTypes = schedule.scan_types as string[];
					const server = await this.prisma.server.findUnique({
						where: { id: schedule.server_id },
						select: { id: true },
					});
					if (!server) continue;

					const execution = await this.prisma.jobExecution.create({
						data: {
							queue_name: QUEUES.SECURITY,
							bull_job_id: 'pending',
							job_type: JOB_TYPES.SECURITY_SERVER_SCAN,
							server_id: schedule.server_id,
							status: 'queued',
							payload: {
								serverId: Number(schedule.server_id),
								types: scanTypes,
							},
						},
					});

					const scanIds: number[] = [];
					for (const scanType of scanTypes) {
						const scan = await this.prisma.securityScan.create({
							data: {
								scan_type: scanType as Parameters<
									typeof this.prisma.securityScan.create
								>[0]['data']['scan_type'],
								server_id: schedule.server_id,
								job_execution_id: execution.id,
							},
						});
						scanIds.push(Number(scan.id));
					}

					const bullJob = await this.securityQueue.add(
						JOB_TYPES.SECURITY_SERVER_SCAN,
						{
							serverId: Number(schedule.server_id),
							scanTypes,
							jobExecutionId: Number(execution.id),
							scanIds,
							scheduleId: Number(schedule.id),
						},
						{
							...DEFAULT_JOB_OPTIONS,
							jobId: `security-server-${Number(schedule.server_id)}-sched-${Date.now()}`,
						},
					);

					await this.prisma.jobExecution.update({
						where: { id: execution.id },
						data: { bull_job_id: String(bullJob.id) },
					});

					this.logger.log(
						`Enqueued scheduled server scan for server ${Number(schedule.server_id)}, types: ${scanTypes.join(', ')}`,
					);
				} else if (schedule.environment_id) {
					const scanTypes = schedule.scan_types as string[];
					const env = await this.prisma.environment.findUnique({
						where: { id: schedule.environment_id },
						select: { id: true, server_id: true },
					});
					if (!env) continue;

					const execution = await this.prisma.jobExecution.create({
						data: {
							queue_name: QUEUES.SECURITY,
							bull_job_id: 'pending',
							job_type: JOB_TYPES.SECURITY_ENVIRONMENT_SCAN,
							environment_id: schedule.environment_id,
							server_id: env.server_id,
							status: 'queued',
							payload: {
								environmentId: Number(schedule.environment_id),
								types: scanTypes,
							},
						},
					});

					const scanIds: number[] = [];
					for (const scanType of scanTypes) {
						const scan = await this.prisma.securityScan.create({
							data: {
								scan_type: scanType as Parameters<
									typeof this.prisma.securityScan.create
								>[0]['data']['scan_type'],
								environment_id: schedule.environment_id,
								job_execution_id: execution.id,
							},
						});
						scanIds.push(Number(scan.id));
					}

					const bullJob = await this.securityQueue.add(
						JOB_TYPES.SECURITY_ENVIRONMENT_SCAN,
						{
							environmentId: Number(schedule.environment_id),
							scanTypes,
							jobExecutionId: Number(execution.id),
							scanIds,
							scheduleId: Number(schedule.id),
						},
						{
							...DEFAULT_JOB_OPTIONS,
							jobId: `security-env-${Number(schedule.environment_id)}-sched-${Date.now()}`,
						},
					);

					await this.prisma.jobExecution.update({
						where: { id: execution.id },
						data: { bull_job_id: String(bullJob.id) },
					});

					this.logger.log(
						`Enqueued scheduled env scan for env ${Number(schedule.environment_id)}, types: ${scanTypes.join(', ')}`,
					);
				}

				// Update last_run_at so we don't double-fire this cycle
				await this.prisma.securityScanSchedule.update({
					where: { id: schedule.id },
					data: { last_run_at: now },
				});
			} catch (err) {
				this.logger.error(
					`Failed to enqueue scheduled scan for schedule ${Number(schedule.id)}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	/**
	 * Returns true if this schedule should fire now.
	 *
	 * Logic:
	 *  - Current time's hour/minute must match schedule hour/minute (+/- 15 min window)
	 *  - For weekly: day_of_week must match
	 *  - For monthly: day_of_month must match
	 *  - Must not have run within the last 23 hours (daily) / 6 days (weekly) / 27 days (monthly)
	 */
	private isDue(
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
		const h = now.getHours();
		const m = now.getMinutes();
		const dow = now.getDay(); // 0=Sunday
		const dom = now.getDate();

		// Check if we're within a 15-minute window of the scheduled time
		const scheduledMinutesOfDay = schedule.hour * 60 + schedule.minute;
		const nowMinutesOfDay = h * 60 + m;
		const diff = Math.abs(nowMinutesOfDay - scheduledMinutesOfDay);
		if (diff > 15) return false;

		// Check minimum gap since last run to avoid double-firing
		if (schedule.last_run_at) {
			const msSinceLastRun = now.getTime() - schedule.last_run_at.getTime();
			const minGapMs: Record<string, number> = {
				daily: 23 * 60 * 60 * 1_000,
				weekly: 6 * 24 * 60 * 60 * 1_000,
				monthly: 27 * 24 * 60 * 60 * 1_000,
			};
			const gap = minGapMs[schedule.frequency] ?? 23 * 60 * 60 * 1_000;
			if (msSinceLastRun < gap) return false;
		}

		if (schedule.frequency === 'weekly') {
			return schedule.day_of_week === null || schedule.day_of_week === dow;
		}
		if (schedule.frequency === 'monthly') {
			return schedule.day_of_month === null || schedule.day_of_month === dom;
		}
		// daily
		return true;
	}
}
