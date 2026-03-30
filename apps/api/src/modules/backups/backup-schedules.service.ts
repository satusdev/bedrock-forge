import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';
import { BackupSchedulesRepository } from './backup-schedules.repository';
import { UpsertBackupScheduleDto } from './dto/backup-schedule.dto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BackupSchedulesService {
	private readonly logger = new Logger(BackupSchedulesService.name);

	constructor(
		private readonly repo: BackupSchedulesRepository,
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.BACKUPS) private readonly backupsQueue: Queue,
	) {}

	async findByEnvironment(envId: number) {
		return this.repo.findByEnvironment(BigInt(envId));
	}

	async upsert(envId: number, dto: UpsertBackupScheduleDto) {
		// Ensure the environment exists
		const env = await this.prisma.environment.findUnique({
			where: { id: BigInt(envId) },
			select: { id: true },
		});
		if (!env) throw new NotFoundException(`Environment ${envId} not found`);

		const schedule = await this.repo.upsert(BigInt(envId), {
			type: dto.type,
			frequency: dto.frequency,
			hour: dto.hour,
			minute: dto.minute,
			day_of_week: dto.day_of_week ?? null,
			day_of_month: dto.day_of_month ?? null,
			enabled: dto.enabled,
		});

		// Sync the BullMQ repeatable job
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
			UpsertBackupScheduleDto,
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
		return `backup-schedule-${scheduleId}`;
	}

	private async syncRepeatableJob(
		scheduleId: number,
		envId: number,
		dto: UpsertBackupScheduleDto,
	) {
		const jobId = this.repeatableJobId(scheduleId);

		// Remove existing repeatable job first (idempotent sync)
		await this.removeRepeatableJob(scheduleId);

		if (!dto.enabled) {
			this.logger.log(
				`Schedule ${scheduleId} disabled — repeatable job removed`,
			);
			return;
		}

		const pattern = this.buildCronPattern(dto);
		this.logger.log(
			`Registering repeatable job ${jobId} with cron ${pattern} for env ${envId}`,
		);

		await this.backupsQueue.add(
			JOB_TYPES.BACKUP_SCHEDULED,
			{
				scheduleId,
				environmentId: envId,
				type: dto.type,
			},
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
			// Get all repeatable jobs and remove any matching this jobId
			const repeatableJobs = await this.backupsQueue.getRepeatableJobs();
			for (const rj of repeatableJobs) {
				if (rj.key.includes(jobId)) {
					await this.backupsQueue.removeRepeatableByKey(rj.key);
					this.logger.log(`Removed repeatable job key: ${rj.key}`);
				}
			}
		} catch (err) {
			this.logger.warn(
				`Could not remove repeatable job for schedule ${scheduleId}: ${err}`,
			);
		}
	}
}
