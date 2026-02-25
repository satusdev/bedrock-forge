import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';

describe('ProjectsController', () => {
	let controller: ProjectsController;
	let service: jest.Mocked<
		Pick<
			ProjectsService,
			| 'getLocalProjects'
			| 'getProjectsStatus'
			| 'getAllTags'
			| 'getComprehensiveProjects'
			| 'getRemoteProjects'
			| 'getTaskStatus'
			| 'createProject'
			| 'deleteProject'
			| 'getProjectEnvironments'
			| 'listProjectServers'
			| 'getProjectBackups'
			| 'getEnvironmentBackups'
			| 'cloneProjectEnvironment'
			| 'getProjectBackupDownloadMetadata'
			| 'getProjectDriveBackupIndex'
			| 'getProjectDriveSettings'
			| 'updateProjectDriveSettings'
			| 'linkEnvironment'
			| 'createEnvironmentBackup'
			| 'getProjectServerLink'
			| 'syncEnvironment'
			| 'listEnvironmentUsers'
			| 'createEnvironmentUser'
			| 'magicLogin'
			| 'updateEnvironment'
			| 'unlinkEnvironment'
			| 'refreshProjectWhois'
			| 'updateGitHubIntegration'
			| 'pullRepository'
			| 'deployFromGithub'
			| 'deployFromClone'
			| 'deployBlankBedrock'
			| 'getDeployStatus'
			| 'bulkStartDdev'
			| 'getRepositoryStatus'
			| 'executeProjectAction'
			| 'startDdev'
			| 'stopDdev'
			| 'restartDdev'
			| 'getProjectPlugins'
			| 'updateProjectPlugin'
			| 'updateAllProjectPlugins'
			| 'getProjectThemes'
			| 'updateProjectTheme'
			| 'updateAllProjectThemes'
			| 'updateWordpressCore'
			| 'getLocalStatus'
			| 'cloneToLocal'
			| 'setupLocal'
			| 'getProjectStatusByName'
			| 'runSecurityScan'
			| 'cloneProjectFromDrive'
		>
	>;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;

	beforeEach(() => {
		service = {
			getLocalProjects: jest.fn(),
			getProjectsStatus: jest.fn(),
			getAllTags: jest.fn(),
			getComprehensiveProjects: jest.fn(),
			getRemoteProjects: jest.fn(),
			getTaskStatus: jest.fn(),
			createProject: jest.fn(),
			deleteProject: jest.fn(),
			getProjectEnvironments: jest.fn(),
			listProjectServers: jest.fn(),
			getProjectBackups: jest.fn(),
			getEnvironmentBackups: jest.fn(),
			cloneProjectEnvironment: jest.fn(),
			cloneProjectFromDrive: jest.fn(),
			getProjectBackupDownloadMetadata: jest.fn(),
			getProjectDriveBackupIndex: jest.fn(),
			getProjectDriveSettings: jest.fn(),
			updateProjectDriveSettings: jest.fn(),
			linkEnvironment: jest.fn(),
			createEnvironmentBackup: jest.fn(),
			getProjectServerLink: jest.fn(),
			syncEnvironment: jest.fn(),
			listEnvironmentUsers: jest.fn(),
			createEnvironmentUser: jest.fn(),
			magicLogin: jest.fn(),
			updateEnvironment: jest.fn(),
			unlinkEnvironment: jest.fn(),
			refreshProjectWhois: jest.fn(),
			updateGitHubIntegration: jest.fn(),
			pullRepository: jest.fn(),
			deployFromGithub: jest.fn(),
			deployFromClone: jest.fn(),
			deployBlankBedrock: jest.fn(),
			getDeployStatus: jest.fn(),
			bulkStartDdev: jest.fn(),
			getRepositoryStatus: jest.fn(),
			executeProjectAction: jest.fn(),
			startDdev: jest.fn(),
			stopDdev: jest.fn(),
			restartDdev: jest.fn(),
			getProjectPlugins: jest.fn(),
			updateProjectPlugin: jest.fn(),
			updateAllProjectPlugins: jest.fn(),
			getProjectThemes: jest.fn(),
			updateProjectTheme: jest.fn(),
			updateAllProjectThemes: jest.fn(),
			updateWordpressCore: jest.fn(),
			getLocalStatus: jest.fn(),
			cloneToLocal: jest.fn(),
			setupLocal: jest.fn(),
			getProjectStatusByName: jest.fn(),
			runSecurityScan: jest.fn(),
		};

		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
		};
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);

		controller = new ProjectsController(
			service as unknown as ProjectsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates local and remote list routes', async () => {
		service.getLocalProjects.mockResolvedValueOnce([]);
		service.getProjectsStatus.mockResolvedValueOnce([]);
		service.getAllTags.mockResolvedValueOnce({ tags: ['client'] } as never);
		service.getComprehensiveProjects.mockResolvedValueOnce([]);
		service.getRemoteProjects.mockResolvedValueOnce([]);
		service.getTaskStatus.mockResolvedValueOnce({ task_id: 't1' } as never);

		await controller.getLocalProjects();
		await controller.getProjectsStatus();
		await controller.getAllTags();
		await controller.getProjectsStatusSlash();
		await controller.getComprehensiveProjects();
		await controller.getRemoteProjects();
		await controller.getTaskStatus('t1');

		expect(service.getLocalProjects).toHaveBeenCalled();
		expect(service.getProjectsStatus).toHaveBeenCalledTimes(2);
		expect(service.getAllTags).toHaveBeenCalled();
		expect(service.getComprehensiveProjects).toHaveBeenCalled();
		expect(service.getRemoteProjects).toHaveBeenCalled();
		expect(service.getTaskStatus).toHaveBeenCalledWith('t1');
	});

	it('delegates create and delete routes', async () => {
		const payload = { name: 'Acme', domain: 'https://acme.test' };
		service.createProject.mockResolvedValueOnce({ id: 3 } as never);
		service.deleteProject.mockResolvedValueOnce(undefined);

		await controller.createProject(payload as never);
		await controller.deleteProject(3);

		expect(service.createProject).toHaveBeenCalledWith(payload, undefined);
		expect(service.deleteProject).toHaveBeenCalledWith(3);
	});

	it('delegates environment routes', async () => {
		const createPayload = {
			environment: 'production',
			server_id: 1,
			wp_url: 'https://acme.test',
			wp_path: '/var/www/acme',
			database_name: 'acme',
			database_user: 'acme',
			database_password: 'secret',
		};
		const updatePayload = { notes: 'updated' };

		service.getProjectEnvironments.mockResolvedValueOnce([]);
		service.listProjectServers.mockResolvedValueOnce([]);
		service.linkEnvironment.mockResolvedValueOnce({ id: 8 } as never);
		service.createEnvironmentBackup.mockResolvedValueOnce({
			status: 'pending',
		} as never);
		service.getProjectServerLink.mockResolvedValueOnce({ id: 8 } as never);
		service.syncEnvironment.mockResolvedValueOnce({
			status: 'pending',
		} as never);
		service.listEnvironmentUsers.mockResolvedValueOnce([]);
		service.createEnvironmentUser.mockResolvedValueOnce({ ID: 1 } as never);
		service.magicLogin.mockResolvedValueOnce({
			url: 'https://acme.test',
		} as never);
		service.updateEnvironment.mockResolvedValueOnce({
			status: 'success',
			data: { id: 8 },
		} as never);
		service.unlinkEnvironment.mockResolvedValueOnce(undefined);
		service.refreshProjectWhois.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.updateGitHubIntegration.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.pullRepository.mockResolvedValueOnce({
			status: 'accepted',
		} as never);
		service.deployFromGithub.mockResolvedValueOnce({
			status: 'queued',
		} as never);
		service.deployFromClone.mockResolvedValueOnce({
			status: 'queued',
		} as never);
		service.deployBlankBedrock.mockResolvedValueOnce({
			status: 'queued',
		} as never);
		service.getDeployStatus.mockResolvedValueOnce({
			status: 'PENDING',
		} as never);
		service.bulkStartDdev.mockResolvedValueOnce({
			status: 'accepted',
			total_success: 1,
		} as never);
		service.getRepositoryStatus.mockResolvedValueOnce({
			clean: true,
		} as never);
		service.runSecurityScan.mockResolvedValueOnce({
			overall_status: 'warn',
		} as never);

		await controller.getProjectEnvironments(1);
		await controller.getProjectServers(1, 'production');
		await controller.linkEnvironment(1, createPayload as never);
		await controller.linkServerToProject(1, createPayload as never);
		await controller.getProjectServer(1, 8, undefined);
		await controller.updateProjectServer(1, 8, updatePayload as never);
		await controller.unlinkServerFromProject(1, 8);
		await controller.syncEnvironment(1, 8, { sync_database: true });
		await controller.createEnvironmentBackup(1, 8, 'database', 'gdrive');
		await controller.listEnvironmentUsers(1, 8);
		await controller.createEnvironmentUser(1, 8, {
			user_login: 'editor',
			user_email: 'editor@example.com',
		} as never);
		await controller.magicLogin(1, 8, '5');
		await controller.updateEnvironment(1, 8, updatePayload as never);
		await controller.unlinkEnvironment(1, 8);
		await controller.refreshProjectWhois(1);
		await controller.updateGitHubIntegration(
			'acme-site',
			{
				repo_url: 'https://github.com/acme/site',
			},
			undefined,
		);
		await controller.pullRepository(
			'acme-site',
			{
				branch: 'main',
			},
			undefined,
		);
		await controller.deployFromGithub(
			'acme-site',
			{
				repo_url: 'https://github.com/acme/site',
				branch: 'main',
				run_composer: true,
			},
			undefined,
		);
		await controller.deployFromClone(
			'acme-site',
			{
				source_project: 'base-site',
				include_uploads: true,
			},
			undefined,
		);
		await controller.deployBlankBedrock(
			'acme-site',
			{
				db_name: 'acme',
				db_user: 'forge',
			},
			undefined,
		);
		await controller.getDeployStatus('acme-site', 'deploy-task-1', undefined);
		await controller.bulkStartDdev({ projects: ['acme-site'] }, undefined);
		await controller.getRepositoryStatus('acme-site', undefined);
		await controller.runSecurityScan(1, '8', undefined);

		expect(service.getProjectEnvironments).toHaveBeenCalledTimes(1);
		expect(service.getProjectEnvironments).toHaveBeenCalledWith(1);
		expect(service.listProjectServers).toHaveBeenCalledWith(1, 'production');
		expect(service.linkEnvironment).toHaveBeenCalledWith(1, createPayload);
		expect(service.getProjectServerLink).toHaveBeenCalledWith(1, 8, undefined);
		expect(service.syncEnvironment).toHaveBeenCalledWith(1, 8, {
			sync_database: true,
		});
		expect(service.createEnvironmentBackup).toHaveBeenCalledWith(
			1,
			8,
			'database',
			'gdrive',
			undefined,
		);
		expect(service.listEnvironmentUsers).toHaveBeenCalledWith(1, 8);
		expect(service.createEnvironmentUser).toHaveBeenCalledWith(1, 8, {
			user_login: 'editor',
			user_email: 'editor@example.com',
		});
		expect(service.magicLogin).toHaveBeenCalledWith(1, 8, '5');
		expect(service.updateEnvironment).toHaveBeenCalledWith(1, 8, updatePayload);
		expect(service.unlinkEnvironment).toHaveBeenCalledWith(1, 8);
		expect(service.refreshProjectWhois).toHaveBeenCalledWith(1);
		expect(service.updateGitHubIntegration).toHaveBeenCalledWith(
			'acme-site',
			{
				repo_url: 'https://github.com/acme/site',
			},
			undefined,
		);
		expect(service.pullRepository).toHaveBeenCalledWith(
			'acme-site',
			'main',
			undefined,
		);
		expect(service.deployFromGithub).toHaveBeenCalledWith(
			'acme-site',
			{
				repo_url: 'https://github.com/acme/site',
				branch: 'main',
				run_composer: true,
			},
			undefined,
		);
		expect(service.deployFromClone).toHaveBeenCalledWith(
			'acme-site',
			{
				source_project: 'base-site',
				include_uploads: true,
			},
			undefined,
		);
		expect(service.deployBlankBedrock).toHaveBeenCalledWith(
			'acme-site',
			{
				db_name: 'acme',
				db_user: 'forge',
			},
			undefined,
		);
		expect(service.getDeployStatus).toHaveBeenCalledWith(
			'acme-site',
			'deploy-task-1',
			undefined,
		);
		expect(service.bulkStartDdev).toHaveBeenCalledWith(
			{
				projects: ['acme-site'],
			},
			undefined,
		);
		expect(service.getRepositoryStatus).toHaveBeenCalledWith(
			'acme-site',
			undefined,
		);
		expect(service.runSecurityScan).toHaveBeenCalledWith(1, 8, undefined);
	});

	it('delegates project backup list and download routes', async () => {
		const setHeader = jest.fn();
		const send = jest.fn();
		const response = { setHeader, send } as unknown as Response;

		service.getProjectBackups.mockResolvedValueOnce([]);
		service.getEnvironmentBackups.mockResolvedValueOnce({ items: [] } as never);
		service.cloneProjectEnvironment.mockResolvedValueOnce({
			status: 'queued',
		} as never);
		service.cloneProjectFromDrive.mockResolvedValueOnce({
			status: 'accepted',
		} as never);
		service.getProjectBackupDownloadMetadata.mockResolvedValueOnce({
			filename: 'backup.tar.gz',
			content: 'abc',
		});

		await controller.getProjectBackups(1, '1', '10');
		await controller.getEnvironmentBackups(1, 8, '1', '10');
		await controller.cloneProjectEnvironment(1, {
			source_env_id: 8,
			target_server_id: 2,
			target_domain: 'staging.acme.test',
		});
		await controller.cloneProjectFromDrive(1, {
			target_server_id: 2,
			target_domain: 'staging.acme.test',
			backup_timestamp: '20260101_010203',
		} as never);
		await controller.downloadProjectBackup(
			1,
			'/tmp/backup.tar.gz',
			'local',
			response,
		);

		expect(service.getProjectBackups).toHaveBeenCalledWith(1, 1, 10);
		expect(service.getEnvironmentBackups).toHaveBeenCalledWith(
			1,
			8,
			1,
			10,
			undefined,
		);
		expect(service.cloneProjectEnvironment).toHaveBeenCalledWith(
			1,
			{
				source_env_id: 8,
				target_server_id: 2,
				target_domain: 'staging.acme.test',
			},
			undefined,
		);
		expect(service.cloneProjectFromDrive).toHaveBeenCalledWith(
			1,
			{
				target_server_id: 2,
				target_domain: 'staging.acme.test',
				backup_timestamp: '20260101_010203',
			},
			undefined,
		);
		expect(service.getProjectBackupDownloadMetadata).toHaveBeenCalledWith(
			1,
			'/tmp/backup.tar.gz',
			'local',
		);
		expect(setHeader).toHaveBeenCalled();
		expect(send).toHaveBeenCalled();
	});

	it('delegates project drive routes', async () => {
		service.getProjectDriveBackupIndex.mockResolvedValueOnce({
			environments: {},
			backup_root: 'WebDev/Projects/Acme/Backups',
		} as never);
		service.getProjectDriveSettings.mockResolvedValueOnce({
			gdrive_connected: false,
		} as never);
		service.updateProjectDriveSettings.mockResolvedValueOnce({
			gdrive_connected: true,
			gdrive_backups_folder_id: 'backup-folder',
		} as never);

		await controller.getProjectDriveBackupIndex(1, 'production');
		await controller.getProjectDriveSettings(1);
		await controller.updateProjectDriveSettings(1, {
			gdrive_backups_folder_id: 'backup-folder',
		});

		expect(service.getProjectDriveBackupIndex).toHaveBeenCalledWith(
			1,
			'production',
		);
		expect(service.getProjectDriveSettings).toHaveBeenCalledWith(1);
		expect(service.updateProjectDriveSettings).toHaveBeenCalledWith(1, {
			gdrive_backups_folder_id: 'backup-folder',
		});
	});

	it('delegates project-name legacy routes', async () => {
		service.executeProjectAction.mockResolvedValueOnce({
			status: 'accepted',
		} as never);
		service.startDdev.mockResolvedValueOnce({ status: 'success' } as never);
		service.stopDdev.mockResolvedValueOnce({ status: 'success' } as never);
		service.restartDdev.mockResolvedValueOnce({ status: 'success' } as never);
		service.getProjectPlugins.mockResolvedValueOnce({ plugins: [] } as never);
		service.updateProjectPlugin.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.updateAllProjectPlugins.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.getProjectThemes.mockResolvedValueOnce({ themes: [] } as never);
		service.updateProjectTheme.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.updateAllProjectThemes.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.updateWordpressCore.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.getLocalStatus.mockResolvedValueOnce({ exists: false } as never);
		service.cloneToLocal.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.setupLocal.mockResolvedValueOnce({ status: 'success' } as never);
		service.getProjectStatusByName.mockResolvedValueOnce({
			project_name: 'acme-site',
		} as never);

		await controller.executeProjectAction('acme-site', { action: 'git_pull' });
		await controller.startDdev('acme-site');
		await controller.stopDdev('acme-site');
		await controller.restartDdev('acme-site');
		await controller.getProjectPlugins('acme-site');
		await controller.updateProjectPlugin('acme-site', 'seo-plugin');
		await controller.updateAllProjectPlugins('acme-site');
		await controller.getProjectThemes('acme-site');
		await controller.updateProjectTheme('acme-site', 'my-theme');
		await controller.updateAllProjectThemes('acme-site');
		await controller.updateWordpressCore('acme-site');
		await controller.getLocalStatus('acme-site');
		await controller.cloneToLocal('acme-site', {
			github_url: 'https://github.com/acme/site',
		});
		await controller.setupLocal('acme-site', {
			start_after_setup: true,
		});
		await controller.getProjectStatusByName('acme-site');

		expect(service.executeProjectAction).toHaveBeenCalledWith(
			'acme-site',
			{
				action: 'git_pull',
			},
			undefined,
		);
		expect(service.updateWordpressCore).toHaveBeenCalledWith(
			'acme-site',
			undefined,
		);
		expect(service.getProjectStatusByName).toHaveBeenCalledWith(
			'acme-site',
			undefined,
		);
	});
});
