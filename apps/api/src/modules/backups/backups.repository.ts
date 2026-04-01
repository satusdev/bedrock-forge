import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateBackupData {
	environment_id: bigint;
	job_execution_id?: bigint;
	type: 'full' | 'db_only' | 'files_only';
	status: 'pending' | 'running' | 'completed' | 'failed';
	file_path?: string;
	size_bytes?: bigint;
	error_message?: string;
	started_at?: Date;
	completed_at?: Date;
}

export interface UpdateJobExecutionData {
	status?: 'queued' | 'active' | 'completed' | 'failed' | 'dead_letter';
	last_error?: string;
	started_at?: Date;
	completed_at?: Date;
	progress?: number;
}

/**
 * BackupsRepository
 *
 * Sole owner of all Prisma operations for the backups domain.
 * No business logic lives here — only query construction and data mapping.
 */
@Injectable()
export class BackupsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findByEnvironmentPaginated(envId: bigint, page: number, limit: number) {
		const skip = (page - 1) * limit;
		const [items, total] = await this.prisma.$transaction([
			this.prisma.backup.findMany({
				where: { environment_id: envId },
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
							execution_log: true,
						},
					},
				},
			}),
			this.prisma.backup.count({ where: { environment_id: envId } }),
		]);
		return { items, total, page, limit };
	}

	findById(id: bigint) {
		return this.prisma.backup.findUnique({
			where: { id },
			include: { environment: { include: { server: true } } },
		});
	}

	create(data: CreateBackupData) {
		return this.prisma.backup.create({ data });
	}

	updateStatus(
		id: bigint,
		data: {
			status?: 'pending' | 'running' | 'completed' | 'failed';
			file_path?: string;
			size_bytes?: bigint;
			error_message?: string;
			started_at?: Date;
			completed_at?: Date;
		},
	) {
		return this.prisma.backup.update({ where: { id }, data });
	}

	delete(id: bigint) {
		return this.prisma.backup.delete({ where: { id } });
	}

	createJobExecution(data: {
		queue_name: string;
		job_type?: string;
		bull_job_id: string;
		environment_id: bigint;
		payload?: Prisma.InputJsonObject;
	}) {
		return this.prisma.jobExecution.create({ data });
	}

	findJobExecutionById(id: bigint) {
		return this.prisma.jobExecution.findUnique({ where: { id } });
	}

	findJobExecutionLog(id: bigint) {
		return this.prisma.jobExecution.findUnique({
			where: { id },
			select: { id: true, status: true, execution_log: true },
		});
	}

	/**
	 * Return only the fields needed to validate a backup can be enqueued.
	 * Kept minimal to avoid over-fetching.
	 */
	findEnvironment(envId: bigint) {
		return this.prisma.environment.findUnique({
			where: { id: envId },
			select: { id: true, google_drive_folder_id: true },
		});
	}
}
