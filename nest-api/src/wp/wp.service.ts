import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RunCommandRequestDto } from './dto/run-command-request.dto';

type DbSiteStateRow = {
	project_server_id: number;
	project_name: string | null;
	server_name: string | null;
	environment: string;
	wp_version: string | null;
	wp_update_available: string | null;
	php_version: string | null;
	plugins_count: number | null;
	plugins_update_count: number | null;
	themes_count: number | null;
	themes_update_count: number | null;
	users_count: number | null;
	last_scanned_at: Date | null;
	scan_error: string | null;
};

type DbUpdateHistoryRow = {
	id: number;
	project_server_id: number;
	update_type: string;
	package_name: string;
	from_version: string | null;
	to_version: string | null;
	status: string;
	applied_at: Date | null;
	error_message: string | null;
	created_at: Date;
};

@Injectable()
export class WpService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private async ensureOwnedProjectServer(
		projectServerId: number,
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT ps.id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${projectServerId} AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Project-server not found' });
		}
	}

	async getSiteState(projectServerId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbSiteStateRow[]>`
			SELECT
				ps.id AS project_server_id,
				p.name AS project_name,
				s.name AS server_name,
				ps.environment::text AS environment,
				wss.wp_version,
				wss.wp_version_available AS wp_update_available,
				wss.php_version,
				wss.plugins_count,
				wss.plugins_update_count,
				wss.themes_count,
				wss.themes_update_count,
				wss.users_count,
				wss.last_scanned_at,
				wss.scan_error
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			JOIN servers s ON s.id = ps.server_id
			LEFT JOIN wp_site_states wss ON wss.project_server_id = ps.id
			WHERE ps.id = ${projectServerId} AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const row = rows[0];
		if (!row) {
			throw new NotFoundException({ detail: 'Project-server not found' });
		}

		return {
			project_server_id: row.project_server_id,
			project_name: row.project_name,
			server_name: row.server_name,
			environment: row.environment,
			wp_version: row.wp_version,
			wp_update_available: row.wp_update_available,
			php_version: row.php_version,
			plugins_count: row.plugins_count ?? 0,
			plugins_update_count: row.plugins_update_count ?? 0,
			themes_count: row.themes_count ?? 0,
			themes_update_count: row.themes_update_count ?? 0,
			users_count: row.users_count ?? 0,
			last_scanned_at: row.last_scanned_at,
			scan_error: row.scan_error,
		};
	}

	async triggerSiteScan(projectServerId: number, ownerId?: number) {
		await this.ensureOwnedProjectServer(projectServerId, ownerId);
		return {
			status: 'queued',
			message: 'WP scan queued',
		};
	}

	async getPendingUpdates(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbSiteStateRow[]>`
			SELECT
				ps.id AS project_server_id,
				p.name AS project_name,
				s.name AS server_name,
				ps.environment::text AS environment,
				wss.wp_version,
				wss.wp_version_available AS wp_update_available,
				wss.php_version,
				wss.plugins_count,
				wss.plugins_update_count,
				wss.themes_count,
				wss.themes_update_count,
				wss.users_count,
				wss.last_scanned_at,
				wss.scan_error
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			JOIN servers s ON s.id = ps.server_id
			LEFT JOIN wp_site_states wss ON wss.project_server_id = ps.id
			WHERE p.owner_id = ${resolvedOwnerId}
		`;

		const updates: Array<Record<string, unknown>> = [];
		for (const row of rows) {
			if (!row.wp_update_available) {
				continue;
			}

			updates.push({
				project_server_id: row.project_server_id,
				project_name: row.project_name ?? '',
				server_name: row.server_name ?? '',
				environment: row.environment,
				update_type: 'core',
				package_name: 'wordpress',
				current_version: row.wp_version ?? 'unknown',
				available_version: row.wp_update_available,
			});
		}

		const sitesWithUpdates = new Set(
			updates.map(update => Number(update.project_server_id ?? 0)),
		).size;

		return {
			total_sites: rows.length,
			sites_with_updates: sitesWithUpdates,
			total_updates: updates.length,
			updates,
		};
	}

	async runCommand(payload: RunCommandRequestDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		await this.ensureOwnedProjectServer(payload.project_server_id, ownerId);

		const taskId = randomUUID();
		const details = JSON.stringify({
			command: payload.command,
			args: payload.args ?? [],
			status: 'queued',
			task_id: taskId,
		});

		await this.prisma.$executeRaw`
			INSERT INTO audit_logs (
				user_id,
				action,
				entity_type,
				entity_id,
				details,
				created_at
			)
			VALUES (
				${resolvedOwnerId},
				${'command'}::auditaction,
				${'wp_cli'},
				${String(payload.project_server_id)},
				${details},
				NOW()
			)
		`;

		return {
			task_id: taskId,
			status: 'queued',
			message: 'Command queued',
		};
	}

	async triggerBulkUpdate(
		payload: {
			update_type?: string;
			project_server_ids?: number[];
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const projectServerIds = payload.project_server_ids ?? [];
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT ps.id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE p.owner_id = ${resolvedOwnerId}
				AND (
					${projectServerIds.length}::int = 0
					OR ps.id = ANY(${projectServerIds})
				)
		`;

		if (!rows.length) {
			throw new BadRequestException({ detail: 'No sites found to update' });
		}

		const updateType = (payload.update_type ?? 'all').toLowerCase();
		const queued = ['core', 'all'].includes(updateType) ? rows.length : 0;

		return {
			task_id: randomUUID(),
			sites_queued: queued,
			message: `Update queued for ${queued} sites`,
		};
	}

	async getUpdateHistory(
		projectServerId?: number,
		limit = 50,
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const safeLimit = Math.max(1, Math.min(200, limit));

		const rows = projectServerId
			? await this.prisma.$queryRaw<DbUpdateHistoryRow[]>`
					SELECT
						u.id,
						u.project_server_id,
						u.update_type::text AS update_type,
						u.package_name,
						u.from_version,
						u.to_version,
						u.status::text AS status,
						u.applied_at,
						u.error_message,
						u.created_at
					FROM wp_updates u
					JOIN project_servers ps ON ps.id = u.project_server_id
					JOIN projects p ON p.id = ps.project_id
					WHERE p.owner_id = ${resolvedOwnerId}
						AND u.project_server_id = ${projectServerId}
					ORDER BY u.created_at DESC
					LIMIT ${safeLimit}
			  `
			: await this.prisma.$queryRaw<DbUpdateHistoryRow[]>`
					SELECT
						u.id,
						u.project_server_id,
						u.update_type::text AS update_type,
						u.package_name,
						u.from_version,
						u.to_version,
						u.status::text AS status,
						u.applied_at,
						u.error_message,
						u.created_at
					FROM wp_updates u
					JOIN project_servers ps ON ps.id = u.project_server_id
					JOIN projects p ON p.id = ps.project_id
					WHERE p.owner_id = ${resolvedOwnerId}
					ORDER BY u.created_at DESC
					LIMIT ${safeLimit}
			  `;

		return {
			total: rows.length,
			updates: rows.map(row => ({
				id: row.id,
				project_server_id: row.project_server_id,
				update_type: row.update_type,
				package_name: row.package_name,
				from_version: row.from_version,
				to_version: row.to_version,
				status: row.status,
				applied_at: row.applied_at,
				error_message: row.error_message,
			})),
		};
	}
}
