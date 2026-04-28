import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateSystemBackupData {
	job_execution_id?: bigint;
	status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface UpdateSystemBackupData {
	status?: 'pending' | 'running' | 'completed' | 'failed';
	file_path?: string;
	size_bytes?: bigint;
	error_message?: string;
	started_at?: Date;
	completed_at?: Date;
}

/**
 * SystemBackupsRepository
 *
 * Sole owner of all Prisma operations for the system-backups domain.
 */
@Injectable()
export class SystemBackupsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findAllPaginated(page: number, limit: number) {
		const skip = (page - 1) * limit;
		const [items, total] = await this.prisma.$transaction([
			this.prisma.systemBackup.findMany({
				skip,
				take: limit,
				orderBy: { created_at: 'desc' },
				include: {
					jobExecution: {
						select: {
							id: true,
							status: true,
							progress: true,
							last_error: true,
							started_at: true,
							completed_at: true,
						},
					},
				},
			}),
			this.prisma.systemBackup.count(),
		]);
		return { items, total, page, limit };
	}

	findById(id: bigint) {
		return this.prisma.systemBackup.findUnique({ where: { id } });
	}

	create(data: CreateSystemBackupData) {
		return this.prisma.systemBackup.create({ data });
	}

	update(id: bigint, data: UpdateSystemBackupData) {
		return this.prisma.systemBackup.update({ where: { id }, data });
	}

	createJobExecution(data: {
		queue_name: string;
		job_type: string;
		bull_job_id: string;
		payload: Record<string, string | number>;
	}) {
		return this.prisma.jobExecution.create({ data });
	}
}
