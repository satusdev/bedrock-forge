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
	Query,
	Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { BackupCreateDto } from './dto/backup-create.dto';
import { BackupsService } from './backups.service';

@Controller('backups')
export class BackupsController {
	constructor(
		private readonly backupsService: BackupsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get()
	async listBackups(
		@Query('project_id') projectId?: string,
		@Query('backup_type') backupType?: string,
		@Query('status') status?: string,
		@Query('skip') skip?: string,
		@Query('limit') limit?: string,
		@Query('page') page?: string,
		@Query('page_size') pageSize?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.listBackups({
			project_id: projectId ? Number(projectId) : undefined,
			backup_type: backupType,
			status,
			skip: skip ? Number(skip) : undefined,
			limit: limit ? Number(limit) : undefined,
			page: page ? Number(page) : undefined,
			page_size: pageSize ? Number(pageSize) : undefined,
			owner_id: ownerId,
		});
	}

	@Get('/')
	async listBackupsSlash(
		@Query('project_id') projectId?: string,
		@Query('backup_type') backupType?: string,
		@Query('status') status?: string,
		@Query('skip') skip?: string,
		@Query('limit') limit?: string,
		@Query('page') page?: string,
		@Query('page_size') pageSize?: string,
		@Headers('authorization') authorization?: string,
	) {
		return this.listBackups(
			projectId,
			backupType,
			status,
			skip,
			limit,
			page,
			pageSize,
			authorization,
		);
	}

	@Post()
	@HttpCode(202)
	async createBackup(
		@Body() payload: BackupCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.createBackup(payload, ownerId);
	}

	@Post('/')
	@HttpCode(202)
	async createBackupSlash(
		@Body() payload: BackupCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.createBackup(payload, ownerId);
	}

	@Post('remote/pull')
	@HttpCode(202)
	async pullRemoteBackup(
		@Body()
		payload: {
			project_server_id: number;
			backup_type?: string;
			include_database?: boolean;
			include_uploads?: boolean;
			include_plugins?: boolean;
			include_themes?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.pullRemoteBackup(payload, ownerId);
	}

	@Post('schedule')
	async scheduleBackup(
		@Body()
		payload: {
			project_id: number;
			schedule_type?: string;
			retention_days?: number;
			backup_type?: string;
			enabled?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.scheduleBackup(payload, ownerId);
	}

	@Get('schedule/:projectId')
	async getBackupSchedule(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.getBackupSchedule(projectId, ownerId);
	}

	@Get('stats/summary')
	async getBackupStatsSummary(
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.getBackupStatsSummary(ownerId);
	}

	@Post('bulk')
	@HttpCode(200)
	async bulkCreateBackups(
		@Body()
		payload: {
			project_ids: number[];
			backup_type?: string;
			storage_type?: string;
			notes?: string;
			gdrive_upload?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.bulkCreateBackups(payload, ownerId);
	}

	@Delete('bulk')
	@HttpCode(200)
	async bulkDeleteBackups(
		@Body() payload: { backup_ids: number[]; force?: boolean },
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.bulkDeleteBackups(payload, ownerId);
	}

	@Get(':backupId')
	async getBackup(
		@Param('backupId', ParseIntPipe) backupId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.getBackup(backupId, ownerId);
	}

	@Delete(':backupId')
	@HttpCode(204)
	async deleteBackup(
		@Param('backupId', ParseIntPipe) backupId: number,
		@Query('force') force?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		await this.backupsService.deleteBackup(backupId, force === 'true', ownerId);
	}

	@Get(':backupId/download')
	async downloadBackup(
		@Param('backupId', ParseIntPipe) backupId: number,
		@Res() res: Response,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		const file = await this.backupsService.getBackupDownloadMetadata(
			backupId,
			ownerId,
		);
		res.setHeader('Content-Type', 'application/octet-stream');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${file.filename}"`,
		);
		res.send(Buffer.from(file.content, 'utf-8'));
	}

	@Post(':backupId/restore')
	async restoreBackup(
		@Param('backupId', ParseIntPipe) backupId: number,
		@Body() options?: { database?: boolean; files?: boolean },
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.restoreBackup(backupId, options, ownerId);
	}

	@Post(':backupId/run')
	@HttpCode(202)
	async runBackup(
		@Param('backupId', ParseIntPipe) backupId: number,
		@Body()
		payload?: {
			project_id?: number;
			environment_id?: number;
			backup_type?: string;
			storage_backends?: string[];
			override_gdrive_folder_id?: string | null;
			task_id?: string;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.runBackup(backupId, payload, ownerId);
	}

	@Post(':backupId/restore/remote')
	@HttpCode(202)
	async restoreBackupRemote(
		@Param('backupId', ParseIntPipe) backupId: number,
		@Body()
		payload: {
			project_server_id: number;
			database?: boolean;
			files?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.backupsService.restoreBackupRemote(backupId, payload, ownerId);
	}
}
