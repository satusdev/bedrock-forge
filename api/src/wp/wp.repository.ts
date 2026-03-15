import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type WpProjectServerContext = {
	project_server_id: number;
	project_name: string;
	environment: string;
	wp_path: string;
	server_id: number;
	server_name: string;
	hostname: string;
	ssh_user: string;
	ssh_port: number;
	ssh_key_path: string | null;
	ssh_password: string | null;
	ssh_private_key: string | null;
};

export type WpSiteStateRow = {
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

export type WpUpdateHistoryRow = {
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

export type UpsertSiteStateData = {
	wpVersion: string | null;
	wpVersionAvailable: string | null;
	phpVersion: string | null;
	plugins: unknown[];
	themes: unknown[];
	pluginsCount: number;
	pluginsUpdateCount: number;
	themesCount: number;
	themesUpdateCount: number;
	usersCount: number;
};

@Injectable()
export class WpRepository {
	constructor(private readonly prisma: PrismaService) {}

	async getOwnedProjectServerContext(
		projectServerId: number,
		ownerId: number,
	): Promise<WpProjectServerContext> {
		const rows = await this.prisma.$queryRaw<WpProjectServerContext[]>`
			SELECT
				ps.id AS project_server_id,
				p.name AS project_name,
				ps.environment::text AS environment,
				ps.wp_path,
				s.id AS server_id,
				s.name AS server_name,
				s.hostname,
				COALESCE(NULLIF(ps.ssh_user, ''), s.ssh_user, 'root') AS ssh_user,
				COALESCE(s.ssh_port, 22) AS ssh_port,
				COALESCE(NULLIF(ps.ssh_key_path, ''), s.ssh_key_path) AS ssh_key_path,
				s.ssh_password,
				COALESCE(s.ssh_private_key, '') AS ssh_private_key
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			JOIN servers s ON s.id = ps.server_id
			WHERE ps.id = ${projectServerId} AND p.owner_id = ${ownerId}
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) {
			throw new NotFoundException({ detail: 'Project-server not found' });
		}
		return row;
	}

	async ensureOwnedProjectServer(
		projectServerId: number,
		ownerId: number,
	): Promise<void> {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT ps.id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${projectServerId} AND p.owner_id = ${ownerId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Project-server not found' });
		}
	}

	async persistResolvedWpPath(
		projectServerId: number,
		resolvedPath: string,
	): Promise<void> {
		await this.prisma.$executeRaw`
			UPDATE project_servers
			SET wp_path = ${resolvedPath}, updated_at = NOW()
			WHERE id = ${projectServerId}
		`;
	}

	async getSystemPrivateKey(): Promise<string | null> {
		const rows = await this.prisma.$queryRaw<
			{ encrypted_value: string | null; value: string | null }[]
		>`
			SELECT encrypted_value, value
			FROM app_settings
			WHERE key = ${'system.ssh.private_key'}
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) {
			return null;
		}
		return row.encrypted_value ?? row.value;
	}

	async upsertSiteState(
		projectServerId: number,
		data: UpsertSiteStateData,
	): Promise<void> {
		await this.prisma.$executeRaw`
			INSERT INTO wp_site_states (
				project_server_id,
				wp_version,
				wp_version_available,
				php_version,
				plugins,
				themes,
				plugins_count,
				plugins_update_count,
				themes_count,
				themes_update_count,
				users_count,
				site_health_score,
				last_scanned_at,
				scan_error,
				created_at,
				updated_at
			)
			VALUES (
				${projectServerId},
				${data.wpVersion},
				${data.wpVersionAvailable},
				${data.phpVersion},
				${JSON.stringify(data.plugins)},
				${JSON.stringify(data.themes)},
				${data.pluginsCount},
				${data.pluginsUpdateCount},
				${data.themesCount},
				${data.themesUpdateCount},
				${data.usersCount},
				NULL,
				NOW(),
				NULL,
				NOW(),
				NOW()
			)
			ON CONFLICT (project_server_id)
			DO UPDATE SET
				wp_version = EXCLUDED.wp_version,
				wp_version_available = EXCLUDED.wp_version_available,
				php_version = EXCLUDED.php_version,
				plugins = EXCLUDED.plugins,
				themes = EXCLUDED.themes,
				plugins_count = EXCLUDED.plugins_count,
				plugins_update_count = EXCLUDED.plugins_update_count,
				themes_count = EXCLUDED.themes_count,
				themes_update_count = EXCLUDED.themes_update_count,
				users_count = EXCLUDED.users_count,
				last_scanned_at = NOW(),
				scan_error = NULL,
				updated_at = NOW()
		`;
	}

	async persistScanFailure(
		projectServerId: number,
		scanError: string,
	): Promise<void> {
		await this.prisma.$executeRaw`
			INSERT INTO wp_site_states (
				project_server_id,
				wp_version,
				wp_version_available,
				php_version,
				plugins,
				themes,
				plugins_count,
				plugins_update_count,
				themes_count,
				themes_update_count,
				users_count,
				site_health_score,
				last_scanned_at,
				scan_error,
				created_at,
				updated_at
			)
			VALUES (
				${projectServerId},
				NULL, NULL, NULL, NULL, NULL,
				0, 0, 0, 0, 0, NULL,
				NOW(), ${scanError}, NOW(), NOW()
			)
			ON CONFLICT (project_server_id)
			DO UPDATE SET
				last_scanned_at = NOW(),
				scan_error = EXCLUDED.scan_error,
				updated_at = NOW()
		`;
	}

	async getSiteState(
		projectServerId: number,
		ownerId: number,
	): Promise<WpSiteStateRow> {
		const rows = await this.prisma.$queryRaw<WpSiteStateRow[]>`
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
			WHERE ps.id = ${projectServerId} AND p.owner_id = ${ownerId}
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) {
			throw new NotFoundException({ detail: 'Project-server not found' });
		}
		return row;
	}

	async getPendingUpdates(ownerId: number): Promise<WpSiteStateRow[]> {
		return this.prisma.$queryRaw<WpSiteStateRow[]>`
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
			WHERE p.owner_id = ${ownerId}
		`;
	}

	async getUpdateHistory(
		ownerId: number,
		projectServerId: number | undefined,
		limit: number,
	): Promise<WpUpdateHistoryRow[]> {
		if (projectServerId !== undefined) {
			return this.prisma.$queryRaw<WpUpdateHistoryRow[]>`
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
				WHERE p.owner_id = ${ownerId}
					AND u.project_server_id = ${projectServerId}
				ORDER BY u.created_at DESC
				LIMIT ${limit}
			`;
		}
		return this.prisma.$queryRaw<WpUpdateHistoryRow[]>`
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
			WHERE p.owner_id = ${ownerId}
			ORDER BY u.created_at DESC
			LIMIT ${limit}
		`;
	}

	async getBulkUpdateProjectServerIds(
		ownerId: number,
		ids: number[],
	): Promise<number[]> {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT ps.id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE p.owner_id = ${ownerId}
				AND (
					${ids.length}::int = 0
					OR ps.id = ANY(${ids})
				)
		`;
		return rows.map(r => r.id);
	}

	async insertAuditLog(
		userId: number,
		entityId: string,
		details: string,
	): Promise<void> {
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
				${userId},
				${'command'}::auditaction,
				${'wp_cli'},
				${entityId},
				${details},
				NOW()
			)
		`;
	}

	/**
	 * Like getOwnedProjectServerContext but without an owner filter — for internal runner use only.
	 */
	async getProjectServerContextUnscoped(
		projectServerId: number,
	): Promise<WpProjectServerContext> {
		const rows = await this.prisma.$queryRaw<WpProjectServerContext[]>`
			SELECT
				ps.id AS project_server_id,
				p.name AS project_name,
				ps.environment::text AS environment,
				ps.wp_path,
				s.id AS server_id,
				s.name AS server_name,
				s.hostname,
				COALESCE(NULLIF(ps.ssh_user, ''), s.ssh_user, 'root') AS ssh_user,
				COALESCE(s.ssh_port, 22) AS ssh_port,
				COALESCE(NULLIF(ps.ssh_key_path, ''), s.ssh_key_path) AS ssh_key_path,
				s.ssh_password,
				COALESCE(s.ssh_private_key, '') AS ssh_private_key
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			JOIN servers s ON s.id = ps.server_id
			WHERE ps.id = ${projectServerId}
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) {
			throw new NotFoundException({ detail: 'Project-server not found' });
		}
		return row;
	}

	/** Returns project_server ids whose last scan is older than staleHours (or never scanned). */
	async getStaleProjectServerIds(
		limit: number,
		staleHours: number,
	): Promise<number[]> {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT ps.id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			LEFT JOIN wp_site_states wss ON wss.project_server_id = ps.id
			WHERE ps.wp_path IS NOT NULL
				AND ps.wp_path <> ''
				AND (
					wss.last_scanned_at IS NULL
					OR wss.last_scanned_at < NOW() - (${staleHours} || ' hours')::interval
				)
			ORDER BY wss.last_scanned_at ASC NULLS FIRST
			LIMIT ${limit}
		`;
		return rows.map(r => r.id);
	}
}
