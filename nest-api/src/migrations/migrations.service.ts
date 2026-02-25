import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
	DriveCloneRequestDto,
	UrlReplaceRequestDto,
} from './dto/migrations.dto';

@Injectable()
export class MigrationsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	async migrateUrlReplace(payload: UrlReplaceRequestDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT ps.id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${payload.project_server_id}
				AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}

		return {
			status: 'accepted',
			task_id: randomUUID(),
			project_server_id: payload.project_server_id,
			source_url: payload.source_url,
			target_url: payload.target_url,
			backup_before: payload.backup_before ?? true,
			download_backup: payload.download_backup ?? true,
			dry_run: payload.dry_run ?? false,
		};
	}

	async cloneFromDrive(payload: DriveCloneRequestDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${payload.project_id}
				AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		return {
			status: 'accepted',
			task_id: randomUUID(),
			project_id: payload.project_id,
			target_domain: payload.target_domain,
			environment: payload.environment,
			backup_timestamp: payload.backup_timestamp,
		};
	}
}
