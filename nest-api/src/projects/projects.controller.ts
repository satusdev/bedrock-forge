import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpCode,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Put,
	Query,
	Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { EnvironmentCreateDto } from './dto/environment-create.dto';
import { EnvironmentUpdateDto } from './dto/environment-update.dto';
import { EnvironmentUserCreateDto } from './dto/environment-user-create.dto';
import { ProjectCreateDto } from './dto/project-create.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
	constructor(
		private readonly projectsService: ProjectsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get('local')
	async getLocalProjects() {
		return this.projectsService.getLocalProjects();
	}

	@Get()
	async getProjectsStatus() {
		return this.projectsService.getProjectsStatus();
	}

	@Get('tags')
	async getAllTags() {
		return this.projectsService.getAllTags();
	}

	@Get('/')
	async getProjectsStatusSlash() {
		return this.projectsService.getProjectsStatus();
	}

	@Get('comprehensive')
	async getComprehensiveProjects() {
		return this.projectsService.getComprehensiveProjects();
	}

	@Get('remote')
	async getRemoteProjects() {
		return this.projectsService.getRemoteProjects();
	}

	@Get('tasks/:taskId')
	async getTaskStatus(@Param('taskId') taskId: string) {
		return this.projectsService.getTaskStatus(taskId);
	}

	@Post(['', '/'])
	async createProject(
		@Body() payload: ProjectCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.createProject(payload, ownerId);
	}

	@Delete(':projectId')
	@HttpCode(204)
	async deleteProject(@Param('projectId', ParseIntPipe) projectId: number) {
		await this.projectsService.deleteProject(projectId);
	}

	@Get(':projectId/environments')
	async getProjectEnvironments(
		@Param('projectId', ParseIntPipe) projectId: number,
	) {
		return this.projectsService.getProjectEnvironments(projectId);
	}

	@Get(':projectId/servers')
	async getProjectServers(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Query('environment') environment?: string,
	) {
		return this.projectsService.listProjectServers(projectId, environment);
	}

	@Get('project-servers/:linkId')
	async getProjectServerById(@Param('linkId', ParseIntPipe) linkId: number) {
		return this.projectsService.getProjectServerById(linkId);
	}

	@Get(':projectId/backups')
	async getProjectBackups(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Query('page') page?: string,
		@Query('page_size') pageSize?: string,
	) {
		return this.projectsService.getProjectBackups(
			projectId,
			page ? Number(page) : undefined,
			pageSize ? Number(pageSize) : undefined,
		);
	}

	@Get(':projectId/backups/download')
	async downloadProjectBackup(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Query('path') path: string,
		@Query('storage') storage: string | undefined,
		@Res() res: Response,
	) {
		const file = await this.projectsService.getProjectBackupDownloadMetadata(
			projectId,
			path,
			storage,
		);
		res.setHeader('Content-Type', 'application/octet-stream');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${file.filename}"`,
		);
		res.send(Buffer.from(file.content, 'utf-8'));
	}

	@Get(':projectId/drive/backups/index')
	async getProjectDriveBackupIndex(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Query('environment') environment?: string,
	) {
		return this.projectsService.getProjectDriveBackupIndex(
			projectId,
			environment,
		);
	}

	@Get(':projectId/drive')
	async getProjectDriveSettings(
		@Param('projectId', ParseIntPipe) projectId: number,
	) {
		return this.projectsService.getProjectDriveSettings(projectId);
	}

	@Patch(':projectId/drive')
	async updateProjectDriveSettings(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body()
		settings: {
			gdrive_folder_id?: string | null;
			gdrive_backups_folder_id?: string | null;
			gdrive_assets_folder_id?: string | null;
			gdrive_docs_folder_id?: string | null;
		},
	) {
		return this.projectsService.updateProjectDriveSettings(projectId, settings);
	}

	@Post(':projectId/environments')
	async linkEnvironment(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body() payload: EnvironmentCreateDto,
	) {
		return this.projectsService.linkEnvironment(projectId, payload);
	}

	@Post(':projectId/servers')
	async linkServerToProject(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body() payload: EnvironmentCreateDto,
	) {
		return this.projectsService.linkEnvironment(projectId, payload);
	}

	@Post(':projectId/environments/:envId/backups')
	@HttpCode(202)
	async createEnvironmentBackup(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('envId', ParseIntPipe) envId: number,
		@Query('backup_type') backupType?: string,
		@Query('storage_type') storageType?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.createEnvironmentBackup(
			projectId,
			envId,
			backupType,
			storageType,
			ownerId,
		);
	}

	@Get(':projectId/environments/:envId/backups')
	async getEnvironmentBackups(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('envId', ParseIntPipe) envId: number,
		@Query('page') page?: string,
		@Query('page_size') pageSize?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.getEnvironmentBackups(
			projectId,
			envId,
			page ? Number(page) : undefined,
			pageSize ? Number(pageSize) : undefined,
			ownerId,
		);
	}

	@Post(':projectId/clone')
	async cloneProjectEnvironment(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body()
		payload: {
			source_env_id: number;
			target_server_id: number;
			target_domain: string;
			target_environment?: string;
			create_cyberpanel_site?: boolean;
			include_database?: boolean;
			include_uploads?: boolean;
			search_replace?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.cloneProjectEnvironment(
			projectId,
			payload,
			ownerId,
		);
	}

	@Post(':projectId/clone/drive')
	@HttpCode(202)
	async cloneProjectFromDrive(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Body()
		payload: {
			target_server_id: number;
			target_domain: string;
			environment?: string;
			backup_timestamp: string;
			source_url?: string;
			target_url?: string;
			create_cyberpanel_site?: boolean;
			include_database?: boolean;
			include_files?: boolean;
			set_shell_user?: string | null;
			run_composer_install?: boolean;
			run_composer_update?: boolean;
			run_wp_plugin_update?: boolean;
			dry_run?: boolean;
			task_id?: string;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.cloneProjectFromDrive(
			projectId,
			payload,
			ownerId,
		);
	}

	@Get(':projectId/environments/:envId/users')
	async listEnvironmentUsers(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('envId', ParseIntPipe) envId: number,
	) {
		return this.projectsService.listEnvironmentUsers(projectId, envId);
	}

	@Post(':projectId/environments/:envId/users')
	async createEnvironmentUser(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('envId', ParseIntPipe) envId: number,
		@Body() payload: EnvironmentUserCreateDto,
	) {
		return this.projectsService.createEnvironmentUser(
			projectId,
			envId,
			payload,
		);
	}

	@Post(':projectId/environments/:envId/users/:userId/login')
	async magicLogin(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('envId', ParseIntPipe) envId: number,
		@Param('userId') userId: string,
	) {
		return this.projectsService.magicLogin(projectId, envId, userId);
	}

	@Put(':projectId/environments/:envId')
	async updateEnvironment(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('envId', ParseIntPipe) envId: number,
		@Body() payload: EnvironmentUpdateDto,
	) {
		return this.projectsService.updateEnvironment(projectId, envId, payload);
	}

	@Delete(':projectId/environments/:envId')
	@HttpCode(204)
	async unlinkEnvironment(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('envId', ParseIntPipe) envId: number,
	) {
		await this.projectsService.unlinkEnvironment(projectId, envId);
	}

	@Get(':projectId/servers/:linkId')
	async getProjectServer(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('linkId', ParseIntPipe) linkId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.getProjectServerLink(
			projectId,
			linkId,
			ownerId,
		);
	}

	@Put(':projectId/servers/:linkId')
	async updateProjectServer(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('linkId', ParseIntPipe) linkId: number,
		@Body() payload: EnvironmentUpdateDto,
	) {
		return this.projectsService.updateEnvironment(projectId, linkId, payload);
	}

	@Delete(':projectId/servers/:linkId')
	@HttpCode(204)
	async unlinkServerFromProject(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('linkId', ParseIntPipe) linkId: number,
	) {
		await this.projectsService.unlinkEnvironment(projectId, linkId);
	}

	@Post(':projectId/servers/:linkId/sync')
	async syncEnvironment(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Param('linkId', ParseIntPipe) linkId: number,
		@Body()
		payload: {
			sync_database?: boolean;
			sync_uploads?: boolean;
			sync_plugins?: boolean;
			sync_themes?: boolean;
			dry_run?: boolean;
			exclude_paths?: string[];
		},
	) {
		return this.projectsService.syncEnvironment(projectId, linkId, payload);
	}

	@Post(':projectId/whois/refresh')
	async refreshProjectWhois(
		@Param('projectId', ParseIntPipe) projectId: number,
	) {
		return this.projectsService.refreshProjectWhois(projectId);
	}

	@Put(':projectName/github')
	async updateGitHubIntegration(
		@Param('projectName') projectName: string,
		@Body() payload: Record<string, unknown>,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.updateGitHubIntegration(
			projectName,
			payload,
			ownerId,
		);
	}

	@Post(':projectName/git/pull')
	async pullRepository(
		@Param('projectName') projectName: string,
		@Body() payload: { branch?: string } | undefined,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.pullRepository(
			projectName,
			payload?.branch,
			ownerId,
		);
	}

	@Post(':projectName/deploy/github')
	async deployFromGithub(
		@Param('projectName') projectName: string,
		@Body()
		payload: {
			repo_url: string;
			branch?: string;
			run_composer?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.deployFromGithub(projectName, payload, ownerId);
	}

	@Post(':projectName/deploy/clone')
	async deployFromClone(
		@Param('projectName') projectName: string,
		@Body()
		payload: {
			source_project: string;
			include_uploads?: boolean;
			include_database?: boolean;
		},
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.deployFromClone(projectName, payload, ownerId);
	}

	@Post(':projectName/deploy/blank')
	async deployBlankBedrock(
		@Param('projectName') projectName: string,
		@Body()
		payload:
			| {
					db_name?: string;
					db_user?: string;
					db_password?: string;
					site_url?: string;
			  }
			| undefined,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.deployBlankBedrock(
			projectName,
			payload,
			ownerId,
		);
	}

	@Get(':projectName/deploy/status/:taskId')
	async getDeployStatus(
		@Param('projectName') projectName: string,
		@Param('taskId') taskId: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.getDeployStatus(projectName, taskId, ownerId);
	}

	@Post('bulk/ddev/start')
	async bulkStartDdev(
		@Body() payload: { projects: string[] },
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.bulkStartDdev(payload, ownerId);
	}

	@Get(':projectName/git/status')
	async getRepositoryStatus(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.getRepositoryStatus(projectName, ownerId);
	}

	@Post(':projectName/action')
	async executeProjectAction(
		@Param('projectName') projectName: string,
		@Body() payload: { action: string },
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.executeProjectAction(
			projectName,
			payload,
			ownerId,
		);
	}

	@Post(':projectName/ddev/start')
	async startDdev(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.startDdev(projectName, ownerId);
	}

	@Post(':projectName/ddev/stop')
	async stopDdev(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.stopDdev(projectName, ownerId);
	}

	@Post(':projectName/ddev/restart')
	async restartDdev(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.restartDdev(projectName, ownerId);
	}

	@Get(':projectName/plugins')
	async getProjectPlugins(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.getProjectPlugins(projectName, ownerId);
	}

	@Post(':projectName/plugins/:pluginName/update')
	async updateProjectPlugin(
		@Param('projectName') projectName: string,
		@Param('pluginName') pluginName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.updateProjectPlugin(
			projectName,
			pluginName,
			ownerId,
		);
	}

	@Post(':projectName/plugins/update-all')
	async updateAllProjectPlugins(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.updateAllProjectPlugins(projectName, ownerId);
	}

	@Get(':projectName/themes')
	async getProjectThemes(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.getProjectThemes(projectName, ownerId);
	}

	@Post(':projectName/themes/:themeName/update')
	async updateProjectTheme(
		@Param('projectName') projectName: string,
		@Param('themeName') themeName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.updateProjectTheme(
			projectName,
			themeName,
			ownerId,
		);
	}

	@Post(':projectName/themes/update-all')
	async updateAllProjectThemes(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.updateAllProjectThemes(projectName, ownerId);
	}

	@Post(':projectName/wordpress/update')
	async updateWordpressCore(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.updateWordpressCore(projectName, ownerId);
	}

	@Get(':projectName/local-status')
	async getLocalStatus(@Param('projectName') projectName: string) {
		return this.projectsService.getLocalStatus(projectName);
	}

	@Post(':projectName/clone-local')
	async cloneToLocal(
		@Param('projectName') projectName: string,
		@Body() payload: Record<string, unknown>,
	) {
		return this.projectsService.cloneToLocal(projectName, payload);
	}

	@Post(':projectName/setup-local')
	async setupLocal(
		@Param('projectName') projectName: string,
		@Body() payload: Record<string, unknown> | undefined,
	) {
		return this.projectsService.setupLocal(projectName, payload);
	}

	@Get(':projectName')
	async getProjectStatusByName(
		@Param('projectName') projectName: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.getProjectStatusByName(projectName, ownerId);
	}

	@Post(':projectId/security/scan')
	async runSecurityScan(
		@Param('projectId', ParseIntPipe) projectId: number,
		@Query('env_id') envId?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.projectsService.runSecurityScan(
			projectId,
			envId ? Number(envId) : undefined,
			ownerId,
		);
	}
}
