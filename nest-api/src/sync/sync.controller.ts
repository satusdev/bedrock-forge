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
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
	constructor(
		private readonly syncService: SyncService,
		private readonly authService: AuthService,
	) {}

	@Post('database/pull')
	async pullDatabase(
		@Body()
		payload: {
			source_project_server_id: number;
			target?: string;
			search_replace?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.syncService.pullDatabase(payload, ownerId);
	}

	@Post('database/push')
	async pushDatabase(
		@Body()
		payload: {
			source?: string;
			target_project_server_id: number;
			search_replace?: boolean;
			backup_first?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.syncService.pushDatabase(payload, ownerId);
	}

	@Post('files/pull')
	async pullFiles(
		@Body()
		payload: {
			source_project_server_id: number;
			paths?: string[];
			target?: string;
			dry_run?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.syncService.pullFiles(payload, ownerId);
	}

	@Post('files/push')
	async pushFiles(
		@Body()
		payload: {
			source?: string;
			target_project_server_id: number;
			paths?: string[];
			dry_run?: boolean;
			delete_extra?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.syncService.pushFiles(payload, ownerId);
	}

	@Get('status/:taskId')
	async getStatus(@Param('taskId') taskId: string) {
		return this.syncService.getStatus(taskId);
	}

	@Post('full')
	async fullSync(
		@Query('source_project_server_id', ParseIntPipe)
		sourceProjectServerId: number,
		@Query('target_project_server_id') targetProjectServerId?: string,
		@Query('sync_database') syncDatabase?: string,
		@Query('sync_uploads') syncUploads?: string,
		@Query('sync_plugins') syncPlugins?: string,
		@Query('sync_themes') syncThemes?: string,
		@Query('dry_run') dryRun?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.syncService.fullSync(
			{
				source_project_server_id: sourceProjectServerId,
				target_project_server_id: targetProjectServerId
					? Number(targetProjectServerId)
					: undefined,
				sync_database:
					syncDatabase !== undefined ? syncDatabase === 'true' : true,
				sync_uploads: syncUploads !== undefined ? syncUploads === 'true' : true,
				sync_plugins: syncPlugins === 'true',
				sync_themes: syncThemes === 'true',
				dry_run: dryRun === 'true',
			},
			ownerId,
		);
	}

	@Post('composer')
	async runRemoteComposer(
		@Body()
		payload: {
			project_server_id: number;
			command?: string;
			packages?: string[];
			flags?: string[];
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId =
			await this.authService.resolveOptionalUserIdFromAuthorizationHeader(
				authorization,
			);
		return this.syncService.runRemoteComposer(payload, ownerId);
	}
}
