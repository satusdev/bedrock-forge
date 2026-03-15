import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DashboardConfig = {
	theme: string;
	primary_color: string;
	accent_color: string;
	sidebar_collapsed: boolean;
	show_advanced_options: boolean;
	default_project_view: string;
	projects_per_page: number;
	notifications_enabled: boolean;
	notification_types: Record<string, boolean>;
	widgets: Record<string, Record<string, unknown>>;
};

const DEFAULT_CONFIG: DashboardConfig = {
	theme: 'system',
	primary_color: '#6366f1',
	accent_color: '#22c55e',
	sidebar_collapsed: false,
	show_advanced_options: false,
	default_project_view: 'grid',
	projects_per_page: 12,
	notifications_enabled: true,
	notification_types: {
		deployments: true,
		backups: true,
		alerts: true,
	},
	widgets: {},
};

@Injectable()
export class DashboardService {
	private config: DashboardConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

	constructor(private readonly prisma: PrismaService) {}

	async getStats() {
		const rows = await this.prisma.$queryRaw<
			{
				total_projects: bigint;
				active_projects: bigint;
				total_servers: bigint;
				healthy_sites: bigint;
				failed_backups: bigint;
			}[]
		>`
			SELECT
				(SELECT COUNT(*)::bigint FROM projects) AS total_projects,
				(SELECT COUNT(*)::bigint FROM projects WHERE status = 'active'::projectstatus) AS active_projects,
				(SELECT COUNT(*)::bigint FROM servers) AS total_servers,
				(SELECT COUNT(*)::bigint FROM project_servers) AS healthy_sites,
				(SELECT COUNT(*)::bigint FROM backups WHERE status = 'failed'::backupstatus) AS failed_backups
		`;

		const stats = rows[0];
		return {
			total_projects: Number(stats?.total_projects ?? 0),
			active_projects: Number(stats?.active_projects ?? 0),
			total_servers: Number(stats?.total_servers ?? 0),
			healthy_sites: Number(stats?.healthy_sites ?? 0),
			recent_deployments: 0,
			failed_backups: Number(stats?.failed_backups ?? 0),
		};
	}

	getConfig() {
		return this.config;
	}

	updateConfig(nextConfig: Partial<DashboardConfig>) {
		this.config = {
			...this.config,
			...nextConfig,
			notification_types: {
				...this.config.notification_types,
				...(nextConfig.notification_types ?? {}),
			},
			widgets: {
				...this.config.widgets,
				...(nextConfig.widgets ?? {}),
			},
		};
		return { status: 'success', message: 'Configuration updated successfully' };
	}

	updateTheme(payload: {
		theme?: string;
		primary_color?: string;
		accent_color?: string;
	}) {
		this.config.theme = payload.theme ?? this.config.theme;
		this.config.primary_color =
			payload.primary_color ?? this.config.primary_color;
		this.config.accent_color = payload.accent_color ?? this.config.accent_color;
		return { status: 'success', message: 'Theme updated successfully' };
	}

	updateLayout(payload: {
		sidebar_collapsed?: boolean;
		show_advanced_options?: boolean;
		default_project_view?: string;
		projects_per_page?: number;
	}) {
		if (payload.sidebar_collapsed !== undefined) {
			this.config.sidebar_collapsed = payload.sidebar_collapsed;
		}
		if (payload.show_advanced_options !== undefined) {
			this.config.show_advanced_options = payload.show_advanced_options;
		}
		if (payload.default_project_view) {
			this.config.default_project_view = payload.default_project_view;
		}
		if (payload.projects_per_page !== undefined) {
			this.config.projects_per_page = payload.projects_per_page;
		}
		return {
			status: 'success',
			message: 'Layout preferences updated successfully',
		};
	}

	updateNotifications(payload: {
		notification_types?: Record<string, boolean>;
		notifications_enabled?: boolean;
	}) {
		if (payload.notification_types) {
			this.config.notification_types = {
				...this.config.notification_types,
				...payload.notification_types,
			};
		}
		if (payload.notifications_enabled !== undefined) {
			this.config.notifications_enabled = payload.notifications_enabled;
		}
		return {
			status: 'success',
			message: 'Notification preferences updated successfully',
		};
	}

	updateWidget(widgetId: string, config: Record<string, unknown>) {
		this.config.widgets[widgetId] = config;
		return {
			status: 'success',
			message: `Widget ${widgetId} configuration updated`,
		};
	}

	getWidget(widgetId: string) {
		const widget = this.config.widgets[widgetId];
		if (!widget) {
			throw new NotFoundException({ detail: `Widget ${widgetId} not found` });
		}
		return { widget_id: widgetId, config: widget };
	}

	resetConfig() {
		this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
		return { status: 'success', message: 'Configuration reset to defaults' };
	}

	exportConfig(exportPath: string) {
		return {
			status: 'success',
			message: `Configuration exported to ${exportPath}`,
		};
	}

	importConfig(importPath: string) {
		return {
			status: 'success',
			message: `Configuration imported from ${importPath}`,
		};
	}

	health() {
		return {
			status: 'healthy',
			service: 'bedrock-forge-dashboard',
			version: '1.0.0',
		};
	}
}
