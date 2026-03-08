import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { MonitorsService } from './monitors.service';

@Controller('monitors')
export class MonitorsController {
	constructor(
		private readonly monitorsService: MonitorsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get(['', '/'])
	async listMonitors(
		@Query('skip') skip?: string,
		@Query('limit') limit?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.listMonitors(
			skip ? Number(skip) : 0,
			limit ? Number(limit) : 100,
			ownerId,
		);
	}

	@Get('by-project/:projectId')
	async listMonitorsByProject(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.listByProject(projectId, ownerId);
	}

	@Get('stats/overview')
	async getOverview(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.getOverview(ownerId);
	}

	@Get('maintenance/status')
	getMaintenanceStatus() {
		return this.monitorsService.getRunnerSnapshot();
	}

	@Post(['', '/'])
	async createMonitor(
		@Body()
		payload: {
			name: string;
			monitor_type?: string;
			url: string;
			interval_seconds?: number;
			timeout_seconds?: number;
			project_id?: number | null;
			project_server_id?: number | null;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.createMonitor(payload, ownerId);
	}

	@Get(':monitorId')
	async getMonitor(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.getMonitor(monitorId, ownerId);
	}

	@Put(':monitorId')
	async updateMonitor(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Body()
		payload: {
			name?: string;
			url?: string;
			interval_seconds?: number;
			timeout_seconds?: number;
			is_active?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.updateMonitor(monitorId, payload, ownerId);
	}

	@Delete(':monitorId')
	@HttpCode(204)
	async deleteMonitor(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		await this.monitorsService.deleteMonitor(monitorId, ownerId);
	}

	@Post(':monitorId/pause')
	async pauseMonitor(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.pauseMonitor(monitorId, ownerId);
	}

	@Post(':monitorId/resume')
	async resumeMonitor(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.resumeMonitor(monitorId, ownerId);
	}

	@Post(':monitorId/check')
	async triggerCheck(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.triggerCheck(monitorId, ownerId);
	}

	@Get(':monitorId/history')
	async getHistory(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Query('hours') hours?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.getHistory(
			monitorId,
			hours ? Number(hours) : 24,
			ownerId,
		);
	}

	@Get(':monitorId/ssl')
	async checkSsl(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.checkSsl(monitorId, ownerId);
	}

	@Get(':monitorId/alerts')
	async getAlerts(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.getAlerts(monitorId, ownerId);
	}

	@Put(':monitorId/alerts')
	async updateAlerts(
		@Param('monitorId', ParseIntPipe) monitorId: number,
		@Body()
		payload: {
			alert_on_down?: boolean;
			alert_on_ssl_expiry?: boolean;
			ssl_expiry_days?: number;
			consecutive_failures?: number;
			notification_channels?: string[];
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.monitorsService.updateAlerts(monitorId, payload, ownerId);
	}
}
