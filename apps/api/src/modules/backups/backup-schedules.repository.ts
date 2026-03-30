import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UpsertScheduleData {
	type: 'full' | 'db_only' | 'files_only';
	frequency: string;
	hour: number;
	minute: number;
	day_of_week?: number | null;
	day_of_month?: number | null;
	enabled: boolean;
}

@Injectable()
export class BackupSchedulesRepository {
	constructor(private readonly prisma: PrismaService) {}

	findByEnvironment(envId: bigint) {
		return this.prisma.backupSchedule.findUnique({
			where: { environment_id: envId },
		});
	}

	upsert(envId: bigint, data: UpsertScheduleData) {
		return this.prisma.backupSchedule.upsert({
			where: { environment_id: envId },
			create: { environment_id: envId, ...data },
			update: data,
		});
	}

	delete(envId: bigint) {
		return this.prisma.backupSchedule.deleteMany({
			where: { environment_id: envId },
		});
	}
}
