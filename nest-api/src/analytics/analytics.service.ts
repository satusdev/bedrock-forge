import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
	AnalyticsReportsQueryDto,
	Ga4RunRequestDto,
	LighthouseRunRequestDto,
} from './dto/analytics.dto';

type DbProjectRow = {
	id: number;
	name: string;
	wp_home: string | null;
};

type DbEnvironmentRow = {
	id: number;
	wp_url: string;
};

type DbReportRow = {
	id: number;
	project_id: number;
	environment_id: number | null;
	report_type: string;
	url: string | null;
	property_id: string | null;
	device: string | null;
	start_date: Date | null;
	end_date: Date | null;
	summary: Record<string, unknown> | string | null;
	payload: Record<string, unknown> | string | null;
	created_at: Date;
};

@Injectable()
export class AnalyticsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private parseJson<T extends Record<string, unknown>>(
		value: T | string | null,
	): T | null {
		if (!value) {
			return null;
		}
		if (typeof value === 'string') {
			try {
				return JSON.parse(value) as T;
			} catch {
				return null;
			}
		}
		return value;
	}

	private normalizeReport(row: DbReportRow) {
		return {
			id: row.id,
			project_id: row.project_id,
			environment_id: row.environment_id,
			report_type: row.report_type,
			url: row.url,
			property_id: row.property_id,
			device: row.device,
			start_date: row.start_date,
			end_date: row.end_date,
			summary: this.parseJson(row.summary),
			created_at: row.created_at,
			payload: this.parseJson(row.payload),
		};
	}

	private async getProject(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbProjectRow[]>`
			SELECT id, name, wp_home
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = rows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
		return project;
	}

	private async getEnvironment(
		projectId: number,
		environmentId?: number,
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		if (!environmentId) {
			return null;
		}

		const rows = await this.prisma.$queryRaw<DbEnvironmentRow[]>`
			SELECT ps.id, ps.wp_url
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${environmentId}
			  AND ps.project_id = ${projectId}
			  AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const environment = rows[0];
		if (!environment) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		return environment;
	}

	private normalizeUrl(value: string): string {
		const trimmed = (value ?? '').trim();
		if (!trimmed) {
			throw new BadRequestException({ detail: 'Invalid URL provided' });
		}
		if (/^https?:\/\//i.test(trimmed)) {
			return trimmed;
		}
		return `https://${trimmed}`;
	}

	private async getReportById(reportId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbReportRow[]>`
			SELECT
				ar.id,
				ar.project_id,
				ar.environment_id,
				ar.report_type::text AS report_type,
				ar.url,
				ar.property_id,
				ar.device,
				ar.start_date,
				ar.end_date,
				ar.summary,
				ar.payload,
				ar.created_at
			FROM analytics_reports ar
			JOIN projects p ON p.id = ar.project_id
			WHERE ar.id = ${reportId} AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const row = rows[0];
		if (!row) {
			throw new NotFoundException({ detail: 'Report not found' });
		}

		return this.normalizeReport(row);
	}

	async runGa4Report(payload: Ga4RunRequestDto, ownerId?: number) {
		const project = await this.getProject(payload.project_id, ownerId);
		const environment = await this.getEnvironment(
			project.id,
			payload.environment_id,
			ownerId,
		);

		const endDate = payload.end_date ? new Date(payload.end_date) : new Date();
		const days = payload.days ?? 30;
		const startDate = payload.start_date
			? new Date(payload.start_date)
			: new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

		const rows = [
			{
				date: startDate.toISOString().slice(0, 10),
				sessions: 120 + project.id,
				users: 80 + project.id,
				pageviews: 260 + project.id,
				newUsers: 40,
				bounceRate: 42.5,
				averageSessionDuration: 97.1,
			},
		];

		const summary = {
			total_sessions: rows.reduce((acc, row) => acc + row.sessions, 0),
			total_users: rows.reduce((acc, row) => acc + row.users, 0),
			total_pageviews: rows.reduce((acc, row) => acc + row.pageviews, 0),
			new_users: rows.reduce((acc, row) => acc + row.newUsers, 0),
			avg_bounce_rate: rows[0]?.bounceRate ?? 0,
			avg_session_duration: rows[0]?.averageSessionDuration ?? 0,
		};
		const resultPayload = {
			rows,
			generated_at: new Date().toISOString(),
			property_id: payload.property_id ?? 'demo',
		};

		const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO analytics_reports (
				project_id,
				environment_id,
				report_type,
				url,
				property_id,
				start_date,
				end_date,
				summary,
				payload,
				created_at,
				updated_at
			)
			VALUES (
				${project.id},
				${environment?.id ?? null},
				${'ga4'}::analyticsreporttype,
				${environment?.wp_url ?? project.wp_home ?? null},
				${payload.property_id ?? null},
				${startDate},
				${endDate},
				${JSON.stringify(summary)}::json,
				${JSON.stringify(resultPayload)}::json,
				NOW(),
				NOW()
			)
			RETURNING id
		`;

		return this.getReportById(inserted[0]?.id ?? 0, ownerId);
	}

	async runLighthouseReport(
		payload: LighthouseRunRequestDto,
		ownerId?: number,
	) {
		const project = await this.getProject(payload.project_id, ownerId);
		const environment = await this.getEnvironment(
			project.id,
			payload.environment_id,
			ownerId,
		);

		const targetUrl = payload.url ?? environment?.wp_url ?? project.wp_home;
		if (!targetUrl) {
			throw new BadRequestException({
				detail: 'Project has no URL configured',
			});
		}
		const normalizedUrl = this.normalizeUrl(targetUrl);
		const device = payload.device ?? 'desktop';

		const summary = {
			performance_score: device === 'mobile' ? 0.78 : 0.91,
			accessibility_score: 0.94,
			best_practices_score: 0.92,
			seo_score: 0.96,
			pwa_score: 0.35,
			core_web_vitals: {
				lcp: 1.9,
				cls: 0.04,
				inp: 210,
			},
			test_duration: 8.4,
		};

		const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO analytics_reports (
				project_id,
				environment_id,
				report_type,
				url,
				device,
				summary,
				payload,
				created_at,
				updated_at
			)
			VALUES (
				${project.id},
				${environment?.id ?? null},
				${'lighthouse'}::analyticsreporttype,
				${normalizedUrl},
				${device},
				${JSON.stringify(summary)}::json,
				${JSON.stringify(summary)}::json,
				NOW(),
				NOW()
			)
			RETURNING id
		`;

		return this.getReportById(inserted[0]?.id ?? 0, ownerId);
	}

	async listReports(query: AnalyticsReportsQueryDto, ownerId?: number) {
		await this.getProject(query.project_id, ownerId);

		const rows = await this.prisma.$queryRaw<DbReportRow[]>`
			SELECT
				id,
				project_id,
				environment_id,
				report_type::text AS report_type,
				url,
				property_id,
				device,
				start_date,
				end_date,
				summary,
				payload,
				created_at
			FROM analytics_reports
			WHERE project_id = ${query.project_id}
			  AND (${query.environment_id ?? null}::int IS NULL OR environment_id = ${query.environment_id ?? null})
			  AND (${query.report_type ?? null}::analyticsreporttype IS NULL OR report_type = ${query.report_type ?? null}::analyticsreporttype)
			ORDER BY created_at DESC
			LIMIT ${query.limit ?? 20}
		`;

		return {
			items: rows.map(row => {
				const report = this.normalizeReport(row);
				return {
					id: report.id,
					project_id: report.project_id,
					environment_id: report.environment_id,
					report_type: report.report_type,
					url: report.url,
					property_id: report.property_id,
					device: report.device,
					start_date: report.start_date,
					end_date: report.end_date,
					summary: report.summary,
					created_at: report.created_at,
				};
			}),
			count: rows.length,
		};
	}

	async getReport(reportId: number, ownerId?: number) {
		return this.getReportById(reportId, ownerId);
	}
}
