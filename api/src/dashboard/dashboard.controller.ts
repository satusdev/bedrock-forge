import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
	constructor(private readonly dashboardService: DashboardService) {}

	@Get('stats')
	async getDashboardStats() {
		return this.dashboardService.getStats();
	}

	@Get('config')
	async getDashboardConfig() {
		return this.dashboardService.getConfig();
	}

	@Put('config')
	async updateDashboardConfig(@Body() config: Record<string, unknown>) {
		return this.dashboardService.updateConfig(config);
	}

	@Put('config/theme')
	async updateTheme(
		@Body()
		payload: {
			theme?: string;
			primary_color?: string;
			accent_color?: string;
		},
	) {
		return this.dashboardService.updateTheme(payload);
	}

	@Put('config/layout')
	async updateLayout(
		@Body()
		payload: {
			sidebar_collapsed?: boolean;
			show_advanced_options?: boolean;
			default_project_view?: string;
			projects_per_page?: number;
		},
	) {
		return this.dashboardService.updateLayout(payload);
	}

	@Put('config/notifications')
	async updateNotifications(
		@Body()
		payload: {
			notification_types?: Record<string, boolean>;
			notifications_enabled?: boolean;
		},
	) {
		return this.dashboardService.updateNotifications(payload);
	}

	@Put('config/widgets/:widgetId')
	async updateWidget(
		@Param('widgetId') widgetId: string,
		@Body() body: { config: Record<string, unknown> },
	) {
		return this.dashboardService.updateWidget(widgetId, body.config ?? {});
	}

	@Get('config/widgets/:widgetId')
	async getWidget(@Param('widgetId') widgetId: string) {
		return this.dashboardService.getWidget(widgetId);
	}

	@Post('config/reset')
	async resetConfig() {
		return this.dashboardService.resetConfig();
	}

	@Post('config/export')
	async exportConfig(@Query('export_path') exportPath?: string) {
		return this.dashboardService.exportConfig(
			exportPath ?? './dashboard-config.json',
		);
	}

	@Post('config/import')
	async importConfig(@Query('import_path') importPath?: string) {
		return this.dashboardService.importConfig(
			importPath ?? './dashboard-config.json',
		);
	}

	@Get('health')
	async health() {
		return this.dashboardService.health();
	}
}
