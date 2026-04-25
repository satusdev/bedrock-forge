import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UpsertPluginUpdateScheduleData {
	frequency: string;
	hour: number;
	minute: number;
	day_of_week?: number | null;
	day_of_month?: number | null;
	enabled: boolean;
}

@Injectable()
export class PluginUpdateSchedulesRepository {
	constructor(private readonly prisma: PrismaService) {}

	findByEnvironment(envId: bigint) {
		return this.prisma.pluginUpdateSchedule.findUnique({
			where: { environment_id: envId },
		});
	}

	upsert(envId: bigint, data: UpsertPluginUpdateScheduleData) {
		return this.prisma.pluginUpdateSchedule.upsert({
			where: { environment_id: envId },
			create: { environment_id: envId, ...data },
			update: data,
		});
	}

	delete(envId: bigint) {
		return this.prisma.pluginUpdateSchedule.deleteMany({
			where: { environment_id: envId },
		});
	}
}
