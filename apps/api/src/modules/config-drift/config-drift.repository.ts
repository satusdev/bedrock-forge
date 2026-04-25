import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ConfigDriftRepository {
	constructor(private readonly prisma: PrismaService) {}

	getProjectEnvironmentsWithScans(projectId: bigint) {
		return this.prisma.environment.findMany({
			where: { project_id: projectId },
			include: {
				server: { select: { id: true, name: true } },
				plugin_scans: {
					orderBy: { scanned_at: 'desc' },
					take: 1,
				},
			},
			orderBy: { created_at: 'asc' },
		});
	}

	async setBaseline(projectId: bigint, envId: bigint) {
		await this.prisma.$transaction([
			this.prisma.environment.updateMany({
				where: { project_id: projectId },
				data: { is_baseline: false },
			}),
			this.prisma.environment.update({
				where: { id: envId },
				data: { is_baseline: true },
			}),
		]);
	}

	clearBaseline(projectId: bigint) {
		return this.prisma.environment.updateMany({
			where: { project_id: projectId },
			data: { is_baseline: false },
		});
	}
}
