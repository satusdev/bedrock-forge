import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DbActivityRow = {
	id: number;
	action: string;
	entity_type: string | null;
	entity_id: string | null;
	details: string | null;
	user_id: number | null;
	user_name: string | null;
	ip_address: string | null;
	created_at: Date | null;
};

@Injectable()
export class ActivityService {
	constructor(private readonly prisma: PrismaService) {}

	async getFeed(query: {
		limit?: number;
		offset?: number;
		action?: string;
		entity_type?: string;
		entity_id?: string;
		hours?: number;
	}) {
		const limit = Math.max(1, Math.min(100, query.limit ?? 50));
		const offset = Math.max(0, query.offset ?? 0);
		const cutoff = query.hours
			? new Date(Date.now() - query.hours * 60 * 60 * 1000)
			: null;

		const countRows = await this.prisma.$queryRaw<{ total: bigint }[]>`
			SELECT COUNT(*)::bigint AS total
			FROM audit_logs a
			WHERE
				(${query.action ?? null}::text IS NULL OR a.action::text = ${query.action ?? null})
				AND (${query.entity_type ?? null}::text IS NULL OR a.entity_type = ${query.entity_type ?? null})
				AND (${query.entity_id ?? null}::text IS NULL OR a.entity_id = ${query.entity_id ?? null})
				AND (${cutoff}::timestamptz IS NULL OR a.created_at >= ${cutoff})
		`;

		const rows = await this.prisma.$queryRaw<DbActivityRow[]>`
			SELECT
				a.id,
				a.action::text AS action,
				a.entity_type,
				a.entity_id,
				a.details,
				a.user_id,
				COALESCE(u.full_name, u.username) AS user_name,
				a.ip_address,
				a.created_at
			FROM audit_logs a
			LEFT JOIN users u ON u.id = a.user_id
			WHERE
				(${query.action ?? null}::text IS NULL OR a.action::text = ${query.action ?? null})
				AND (${query.entity_type ?? null}::text IS NULL OR a.entity_type = ${query.entity_type ?? null})
				AND (${query.entity_id ?? null}::text IS NULL OR a.entity_id = ${query.entity_id ?? null})
				AND (${cutoff}::timestamptz IS NULL OR a.created_at >= ${cutoff})
			ORDER BY a.created_at DESC NULLS LAST
			OFFSET ${offset}
			LIMIT ${limit}
		`;

		const total = Number(countRows[0]?.total ?? 0);
		return {
			items: rows.map(row => ({
				id: row.id,
				action: row.action,
				entity_type: row.entity_type,
				entity_id: row.entity_id,
				details: row.details,
				user_id: row.user_id,
				user_name: row.user_name,
				ip_address: row.ip_address,
				created_at: row.created_at,
			})),
			total,
			has_more: offset + limit < total,
		};
	}

	async getSummary(hours = 24) {
		const normalizedHours = Math.max(1, Math.min(24 * 365, hours));
		const cutoff = new Date(Date.now() - normalizedHours * 60 * 60 * 1000);

		const actionRows = await this.prisma.$queryRaw<
			{ action: string; count: bigint }[]
		>`
			SELECT a.action::text AS action, COUNT(*)::bigint AS count
			FROM audit_logs a
			WHERE a.created_at >= ${cutoff}
			GROUP BY a.action
		`;

		const entityRows = await this.prisma.$queryRaw<
			{ entity_type: string; count: bigint }[]
		>`
			SELECT a.entity_type, COUNT(*)::bigint AS count
			FROM audit_logs a
			WHERE a.created_at >= ${cutoff} AND a.entity_type IS NOT NULL
			GROUP BY a.entity_type
		`;

		const totalRows = await this.prisma.$queryRaw<
			{ total_activities: bigint; unique_users: bigint }[]
		>`
			SELECT
				COUNT(*)::bigint AS total_activities,
				COUNT(DISTINCT user_id)::bigint AS unique_users
			FROM audit_logs
			WHERE created_at >= ${cutoff}
		`;

		const byAction: Record<string, number> = {};
		for (const row of actionRows) {
			byAction[row.action] = Number(row.count);
		}

		const byEntity: Record<string, number> = {};
		for (const row of entityRows) {
			byEntity[row.entity_type] = Number(row.count);
		}

		return {
			period_hours: normalizedHours,
			total_activities: Number(totalRows[0]?.total_activities ?? 0),
			by_action: byAction,
			by_entity: byEntity,
			unique_users: Number(totalRows[0]?.unique_users ?? 0),
		};
	}
}
