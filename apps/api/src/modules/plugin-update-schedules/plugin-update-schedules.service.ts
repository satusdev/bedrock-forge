import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';
import { PluginUpdateSchedulesRepository } from './plugin-update-schedules.repository';
import { UpsertPluginUpdateScheduleDto } from './dto/plugin-update-schedule.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PluginUpdateSchedulesService {
	private readonly logger = new Logger(PluginUpdateSchedulesService.name);

	constructor(
		private readonly repo: PluginUpdateSchedulesRepository,
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.PLUGIN_UPDATES)
		private readonly pluginUpdatesQueue: Queue,
	) {}

	async findByEnvironment(envId: number) {
		return this.repo.findByEnvironment(BigInt(envId));
	}

	async upsert(envId: number, dto: UpsertPluginUpdateScheduleDto) {
		const env = await this.prisma.environment.findUnique({
			where: { id: BigInt(envId) },
			select: { id: true },
		});
		if (!env) throw new NotFoundException(`Environment ${envId} not found`);

		const schedule = await this.repo.upsert(BigInt(envId), {
			frequency: dto.frequency,
			hour: dto.hour,
			minute: dto.minute,
			day_of_week: dto.day_of_week ?? null,
			day_of_month: dto.day_of_month ?? null,
			enabled: dto.enabled,
		});

		await this.syncRepeatableJob(Number(schedule.id), envId, dto);
		return schedule;
	}

	async remove(envId: number) {
		const schedule = await this.repo.findByEnvironment(BigInt(envId));
		if (schedule) {
			await this.removeRepeatableJob(Number(schedule.id));
		}
		await this.repo.delete(BigInt(envId));
	}

	// ── BullMQ repeatable job management ────────────────────────────────────

	private buildCronPattern(
		dto: Pick<
			UpsertPluginUpdateScheduleDto,
			'frequency' | 'hour' | 'minute' | 'day_of_week' | 'day_of_month'
		>,
	): string {
		switch (dto.frequency) {
			case 'daily':
				return `${dto.minute} ${dto.hour} * * *`;
			case 'weekly':
				return `${dto.minute} ${dto.hour} * * ${dto.day_of_week ?? 0}`;
			case 'monthly':
				return `${dto.minute} ${dto.hour} ${dto.day_of_month ?? 1} * *`;
			default:
				throw new Error(`Unknown frequency: ${dto.frequency}`);
		}
	}

	private repeatableJobId(scheduleId: number): string {
		return `plugin-update-schedule-${scheduleId}`;
	}

	private async syncRepeatableJob(
		scheduleId: number,
		envId: number,
		dto: UpsertPluginUpdateScheduleDto,
	) {
		await this.removeRepeatableJob(scheduleId);

		if (!dto.enabled) {
			this.logger.log(
				`Plugin update schedule ${scheduleId} disabled — repeatable job removed`,
			);
			return;
		}

		const jobId = this.repeatableJobId(scheduleId);
		const pattern = this.buildCronPattern(dto);
		this.logger.log(
			`Registering repeatable job ${jobId} with cron ${pattern} for env ${envId}`,
		);

		await this.pluginUpdatesQueue.add(
			JOB_TYPES.PLUGIN_SCHEDULED_UPDATE,
			{ scheduleId, environmentId: envId },
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
		const jobs = await this.pluginUpdatesQueue.getRepeatableJobs();
		for (const rj of jobs) {
			if (rj.id === jobId) {
				await this.pluginUpdatesQueue.removeRepeatableByKey(rj.key);
				this.logger.log(`Removed repeatable job ${jobId}`);
			}
		}
	}
}
