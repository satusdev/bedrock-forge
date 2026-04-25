import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UpsertCleanupScheduleData {
	enabled?: boolean;
	frequency?: string;
	hour?: number;
	minute?: number;
	day_of_week?: number | null;
	day_of_month?: number | null;
	keep_revisions?: number;
}

@Injectable()
export class CleanupSchedulesRepository {
	constructor(private readonly prisma: PrismaService) {}

	findByEnvironment(envId: bigint) {
		return this.prisma.cleanupSchedule.findUnique({
			where: { environment_id: envId },
		});
	}

	upsert(envId: bigint, data: UpsertCleanupScheduleData) {
		return this.prisma.cleanupSchedule.upsert({
			where: { environment_id: envId },
			update: { ...data },
			create: {
				environment_id: envId,
				enabled: data.enabled ?? true,
				frequency: data.frequency ?? 'weekly',
				hour: data.hour ?? 3,
				minute: data.minute ?? 30,
				day_of_week: data.day_of_week ?? null,
				day_of_month: data.day_of_month ?? null,
				keep_revisions: data.keep_revisions ?? 3,
			},
		});
	}

	delete(envId: bigint) {
		return this.prisma.cleanupSchedule.delete({
			where: { environment_id: envId },
		});
	}

	findAllEnabled() {
		return this.prisma.cleanupSchedule.findMany({
			where: { enabled: true },
			include: { environment: { include: { server: true } } },
		});
	}

	updateLastRun(envId: bigint, lastRunAt: Date) {
		return this.prisma.cleanupSchedule.update({
			where: { environment_id: envId },
			data: { last_run_at: lastRunAt },
		});
	}
}
