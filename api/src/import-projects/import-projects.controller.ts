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
import { ImportProjectsService } from './import-projects.service';

@Controller('import-projects')
export class ImportProjectsController {
	constructor(
		private readonly importProjectsService: ImportProjectsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get(':serverId/websites')
	async listServerWebsites(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.importProjectsService.listServerWebsites(serverId, ownerId);
	}

	@Post(':serverId/import')
	async importWebsite(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Body()
		payload: {
			domain: string;
			project_name?: string;
			environment?: string;
			create_monitor?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.importProjectsService.importWebsite(serverId, payload, ownerId);
	}

	@Post(':serverId/import-all')
	async importAllWebsites(
		@Param('serverId', ParseIntPipe) serverId: number,
		@Query('environment') environment?: string,
		@Query('create_monitors') createMonitors?: string,
		@Query('wordpress_only') wordpressOnly?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.importProjectsService.importAllWebsites(
			serverId,
			{
				environment,
				create_monitors:
					createMonitors === undefined ? true : createMonitors === 'true',
				wordpress_only:
					wordpressOnly === undefined ? true : wordpressOnly === 'true',
			},
			ownerId,
		);
	}
}
