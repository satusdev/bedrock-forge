import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import {
	CreateEnvironmentDto,
	UpdateEnvironmentDto,
	UpsertDbCredentialsDto,
} from './dto/environment.dto';

@Injectable()
export class EnvironmentsRepository {
	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
	) {}

	findAll() {
		return this.prisma.environment.findMany({
			include: {
				project: { select: { id: true, name: true } },
				server: {
					select: { id: true, name: true, ip_address: true, status: true },
				},
			},
			orderBy: { created_at: 'desc' },
		});
	}

	findByProject(projectId: bigint) {
		return this.prisma.environment.findMany({
			where: { project_id: projectId },
			include: {
				project: { select: { id: true, name: true } },
				server: {
					select: { id: true, name: true, ip_address: true, status: true },
				},
				job_executions: {
					where: { job_type: 'project:create-bedrock' },
					orderBy: { created_at: 'desc' },
					take: 1,
					select: {
						id: true,
						status: true,
						progress: true,
						last_error: true,
					},
				},
			},
			orderBy: { created_at: 'asc' },
		});
	}

	findById(id: bigint) {
		return this.prisma.environment.findUnique({
			where: { id },
			include: {
				server: {
					select: { id: true, name: true, ip_address: true, status: true },
				},
			},
		});
	}

	create(projectId: bigint, dto: CreateEnvironmentDto) {
		return this.prisma.environment.create({
			data: {
				project_id: projectId,
				server_id: BigInt(dto.server_id),
				type: dto.type,
				url: dto.url,
				root_path: dto.root_path,
				backup_path: dto.backup_path ?? null,
				google_drive_folder_id: dto.google_drive_folder_id ?? null,
			},
			include: {
				server: {
					select: { id: true, name: true, ip_address: true, status: true },
				},
			},
		});
	}

	update(id: bigint, dto: UpdateEnvironmentDto) {
		return this.prisma.environment.update({
			where: { id },
			data: {
				...(dto.server_id !== undefined && {
					server_id: BigInt(dto.server_id),
				}),
				...(dto.type !== undefined && { type: dto.type }),
				...(dto.url !== undefined && { url: dto.url }),
				...(dto.root_path !== undefined && { root_path: dto.root_path }),
				...(dto.backup_path !== undefined && {
					backup_path: dto.backup_path,
				}),
				// Allow explicit null to clear the field
				...(dto.google_drive_folder_id !== undefined && {
					google_drive_folder_id: dto.google_drive_folder_id || null,
				}),
			},
			include: {
				server: {
					select: { id: true, name: true, ip_address: true, status: true },
				},
			},
		});
	}

	delete(id: bigint) {
		return this.prisma.environment.delete({ where: { id } });
	}

	/** Decrypt and return WP DB credentials for an environment, or null if none stored. */
	async getDbCredentials(envId: bigint): Promise<{
		dbName: string;
		dbUser: string;
		dbPassword: string;
		dbHost: string;
	} | null> {
		const row = await this.prisma.wpDbCredentials.findUnique({
			where: { environment_id: envId },
		});
		if (!row) return null;
		return {
			dbName: this.enc.decrypt(row.db_name_encrypted),
			dbUser: this.enc.decrypt(row.db_user_encrypted),
			dbPassword: this.enc.decrypt(row.db_password_encrypted),
			dbHost: this.enc.decrypt(row.db_host_encrypted),
		};
	}

	/** Encrypt and upsert WP DB credentials for an environment. */
	async upsertDbCredentials(envId: bigint, dto: UpsertDbCredentialsDto) {
		const data = {
			db_name_encrypted: this.enc.encrypt(dto.dbName),
			db_user_encrypted: this.enc.encrypt(dto.dbUser),
			db_password_encrypted: this.enc.encrypt(dto.dbPassword),
			db_host_encrypted: this.enc.encrypt(dto.dbHost),
		};
		await this.prisma.wpDbCredentials.upsert({
			where: { environment_id: envId },
			update: data,
			create: { environment_id: envId, ...data },
		});
		return {
			dbName: dto.dbName,
			dbUser: dto.dbUser,
			dbPassword: dto.dbPassword,
			dbHost: dto.dbHost,
		};
	}
}
