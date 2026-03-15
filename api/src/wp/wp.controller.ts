import {
	Body,
	Controller,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RunCommandRequestDto } from './dto/run-command-request.dto';
import { WpService } from './wp.service';

@Controller('wp')
export class WpController {
	constructor(
		private readonly wpService: WpService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get('sites/:projectServerId/state')
	async getWpSiteState(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.wpService.getSiteState(projectServerId, ownerId);
	}

	@Post('sites/:projectServerId/scan')
	async triggerWpScan(
		@Param('projectServerId', ParseIntPipe) projectServerId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.wpService.triggerSiteScan(projectServerId, ownerId);
	}

	@Post('commands/run')
	async runWpCommand(
		@Body() payload: RunCommandRequestDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.wpService.runCommand(payload, ownerId);
	}

	@Post('runner/command')
	async runWpCommandLegacy(
		@Body() payload: RunCommandRequestDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.wpService.runCommand(payload, ownerId);
	}

	@Get('updates')
	async getPendingUpdates(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.wpService.getPendingUpdates(ownerId);
	}

	@Post('updates/bulk')
	async triggerBulkUpdate(
		@Body()
		payload: {
			update_type?: string;
			project_server_ids?: number[];
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.wpService.triggerBulkUpdate(payload, ownerId);
	}

	@Get('updates/history')
	async getUpdateHistory(
		@Query('project_server_id') projectServerId?: string,
		@Query('limit') limit?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.wpService.getUpdateHistory(
			projectServerId ? Number(projectServerId) : undefined,
			limit ? Number(limit) : undefined,
			ownerId,
		);
	}
}
