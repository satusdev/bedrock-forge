import axios from 'axios';
import toast from 'react-hot-toast';
import { mockDashboardApi } from './mockApi';

const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

// Create axios instance
const api = axios.create({
	baseURL: API_BASE_URL,
	timeout: 30000,
	headers: {
		'Content-Type': 'application/json',
	},
});

// Flag to use mock API when backend is not available
let useMockApi = false;

// Check if backend is available
const checkBackendAvailability = async () => {
	try {
		// Use absolute URL to bypass baseURL since health check is at root /health
		await axios.get('http://127.0.0.1:8000/health');
		useMockApi = false;
	} catch (error) {
		console.error(
			'Backend not available. Please ensure the API server is running.'
		);
		// Do not fallback to mock API automatically to ensure we debug real connections
		useMockApi = false;
	}
};

// Request interceptor
api.interceptors.request.use(
	config => {
		// Add auth token if available
		const token = localStorage.getItem('auth_token');
		if (token) {
			config.headers.Authorization = `Bearer ${token}`;
		}
		return config;
	},
	error => {
		return Promise.reject(error);
	}
);

// Response interceptor with token refresh
api.interceptors.response.use(
	response => response,
	async error => {
		const originalRequest = error.config;
		const message =
			error.response?.data?.detail || error.message || 'An error occurred';
		const status = error.response?.status;
		const errorCode = error.response?.data?.error_code;

		// Handle 401 - attempt token refresh
		if (status === 401 && !originalRequest._retry) {
			originalRequest._retry = true;

			const refreshToken = localStorage.getItem('refresh_token');
			if (refreshToken) {
				try {
					const response = await api.post('/auth/refresh', {
						refresh_token: refreshToken,
					});
					const { access_token, refresh_token: newRefresh } = response.data;

					localStorage.setItem('auth_token', access_token);
					localStorage.setItem('refresh_token', newRefresh);

					originalRequest.headers.Authorization = `Bearer ${access_token}`;
					return api(originalRequest);
				} catch (refreshError) {
					// Refresh failed, redirect to login
					localStorage.removeItem('auth_token');
					localStorage.removeItem('refresh_token');
					window.location.href = '/login';
					return Promise.reject(refreshError);
				}
			} else {
				localStorage.removeItem('auth_token');
				window.location.href = '/login';
			}
		}

		// Enhanced error categorization
		let toastMessage = message;
		let toastType: 'error' | 'warning' | 'info' = 'error';

		// Handle different error types
		if (status === 403) {
			toastMessage =
				'Access denied. You do not have permission to perform this action.';
		} else if (status === 404) {
			toastMessage = 'The requested resource was not found.';
			toastType = 'warning';
		} else if (status === 409) {
			toastMessage =
				'Conflict: The operation could not be completed due to a conflict.';
			toastType = 'warning';
		} else if (status === 422) {
			toastMessage = 'Validation error: Please check your input and try again.';
			toastType = 'warning';
		} else if (status === 429) {
			toastMessage = 'Too many requests. Please wait a moment and try again.';
			toastType = 'info';
		} else if (status && status >= 500) {
			toastMessage =
				error.response?.data?.detail ||
				'Server error. Please try again later or contact support if the problem persists.';
		} else if (!status) {
			// Network error
			toastMessage =
				'Network error. Please check your connection and try again.';
		}

		// Handle specific error codes
		if (errorCode === 'BACKUP_IN_PROGRESS') {
			toastMessage = 'A backup is already in progress for this project.';
			toastType = 'warning';
		} else if (errorCode === 'DDEV_NOT_RUNNING') {
			toastMessage =
				'DDEV is not running for this project. Please start DDEV first.';
			toastType = 'warning';
		} else if (errorCode === 'WORDPRESS_ERROR') {
			toastMessage =
				'WordPress error occurred. Please check the WordPress configuration.';
		} else if (errorCode === 'PLUGIN_UPDATE_FAILED') {
			toastMessage =
				'Plugin update failed. Please check the plugin compatibility.';
		} else if (errorCode === 'BULK_OPERATION_LIMIT') {
			toastMessage =
				'Too many projects selected for bulk operation. Please select fewer projects.';
			toastType = 'warning';
		}

		// Show appropriate toast (skip for 401 as we handle it above)
		if (status >= 400 && status !== 401) {
			if (toastType === 'error') {
				toast.error(toastMessage, { duration: 5000 });
			} else if (toastType === 'warning') {
				toast(toastMessage, { duration: 4000, icon: '⚠️' });
			} else {
				toast(toastMessage, { duration: 3000 });
			}
		}

		return Promise.reject(error);
	}
);

// Dashboard API
export const dashboardApi = {
	// Dashboard stats
	getStats: async () => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.getStats()
			: api.get('/dashboard/stats');
	},

	// Projects
	getProjects: async () => {
		await checkBackendAvailability();
		return useMockApi ? mockDashboardApi.getProjects() : api.get('/projects');
	},
	getComprehensiveProjects: async () => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.getComprehensiveProjects()
			: api.get('/projects/comprehensive');
	},

	// New: Local and Remote project separation
	getLocalProjects: async () => {
		await checkBackendAvailability();
		return api.get('/projects/local');
	},
	getRemoteProjects: async () => {
		await checkBackendAvailability();
		return api.get('/projects/remote');
	},
	createProject: async (projectData: any) => {
		await checkBackendAvailability();
		return api.post('/projects', projectData);
	},
	deleteProject: async (projectId: number) => {
		await checkBackendAvailability();
		return api.delete(`/projects/${projectId}`);
	},
	getProjectTags: async () => {
		await checkBackendAvailability();
		return api.get('/projects/tags');
	},

	// Environment linking
	getProjectEnvironments: async (projectId: number) => {
		await checkBackendAvailability();
		return api.get(`/projects/${projectId}/environments`);
	},
	linkEnvironment: async (projectId: number, envData: any) => {
		await checkBackendAvailability();
		return api.post(`/projects/${projectId}/environments`, envData);
	},
	unlinkEnvironment: async (projectId: number, envId: number) => {
		await checkBackendAvailability();
		return api.delete(`/projects/${projectId}/environments/${envId}`);
	},

	// Google Drive settings
	getProjectDriveSettings: async (projectId: number) => {
		await checkBackendAvailability();
		return api.get(`/projects/${projectId}/drive`);
	},
	updateProjectDriveSettings: async (projectId: number, settings: any) => {
		await checkBackendAvailability();
		return api.patch(`/projects/${projectId}/drive`, settings);
	},

	getProjectStatus: async (projectName: string) => {
		await checkBackendAvailability();
		return useMockApi
			? Promise.resolve({ data: {} })
			: api.get(`/projects/${projectName}/status`);
	},
	executeProjectAction: async (
		projectName: string,
		action: string,
		data?: any
	) => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.executeProjectAction(projectName, action, data)
			: api.post(`/projects/${projectName}/action`, { action, ...data });
	},

	// GitHub Integration
	getGitHubAuthStatus: async () => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.getGitHubAuthStatus()
			: api.get('/github/auth/status');
	},
	getGitHubAuthUrl: (redirectUri?: string) =>
		api.get('/github/auth/url', { params: { redirect_uri: redirectUri } }),
	authenticateGitHub: (tokenOrCode: string, state?: string) =>
		state
			? api.post('/github/auth', { code: tokenOrCode, state })
			: api.post('/github/auth', { token: tokenOrCode }),
	disconnectGitHub: () => api.post('/github/auth/disconnect'),
	updateGitHubIntegration: (projectName: string, data: any) =>
		api.put(`/projects/${projectName}/github`, data),
	getRepositoryInfo: (repoUrl: string) =>
		api.get(`/github/repository/${encodeURIComponent(repoUrl)}/info`),
	getRepositoryBranches: (repoUrl: string) =>
		api.get(`/github/repository/${encodeURIComponent(repoUrl)}/branches`),
	getRepositoryCommits: (repoUrl: string, branch?: string, limit?: number) =>
		api.get(`/github/repository/${encodeURIComponent(repoUrl)}/commits`, {
			params: { branch, limit },
		}),
	getRepositoryPullRequests: (repoUrl: string, state?: string) =>
		api.get(`/github/repository/${encodeURIComponent(repoUrl)}/pull-requests`, {
			params: { state },
		}),
	getRepositoryDeployments: (repoUrl: string, environment?: string) =>
		api.get(`/github/repository/${encodeURIComponent(repoUrl)}/deployments`, {
			params: { environment },
		}),
	cloneRepository: (repoUrl: string, targetPath: string, branch?: string) =>
		api.post(`/github/repository/${encodeURIComponent(repoUrl)}/clone`, {
			target_path: targetPath,
			branch,
		}),
	pullRepository: (projectName: string, branch?: string) =>
		api.post(`/projects/${projectName}/git/pull`, { branch }),
	getRepositoryStatus: (projectName: string) =>
		api.get(`/projects/${projectName}/git/status`),
	createWebhook: (repoUrl: string, webhookUrl: string, events?: string[]) =>
		api.post('/github/webhook/create', {
			repository_url: repoUrl,
			webhook_url: webhookUrl,
			events,
		}),
	getWebhooks: (repoUrl: string) =>
		api.get(`/github/webhooks/${encodeURIComponent(repoUrl)}`),
	createDeployment: (
		repoUrl: string,
		ref: string,
		environment: string,
		description?: string
	) =>
		api.post('/github/deployment/create', {
			repository_url: repoUrl,
			ref,
			environment,
			description,
		}),

	// Google Drive Integration
	getGoogleDriveAuthStatus: async () => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.getGoogleDriveAuthStatus()
			: api.get('/gdrive/auth/status');
	},
	getGoogleDriveAuthUrl: (redirectUri?: string) =>
		api.get('/gdrive/auth/url', { params: { redirect_uri: redirectUri } }),
	authenticateGoogleDrive: (redirectUri?: string) =>
		api.post('/gdrive/auth', null, { params: { redirect_uri: redirectUri } }),
	completeGoogleDriveAuth: (
		code: string,
		state: string,
		redirectUri?: string
	) =>
		api.post('/gdrive/auth/callback', {
			code,
			state,
			redirect_uri: redirectUri,
		}),
	disconnectGoogleDrive: () => api.post('/gdrive/auth/disconnect'),
	createDriveFolder: (folderName: string, parentFolderId?: string) =>
		api.post('/gdrive/folder', {
			folder_name: folderName,
			parent_folder_id: parentFolderId,
		}),
	listDriveFiles: (folderId?: string, fileTypes?: string[]) =>
		api.get('/gdrive/folder/files', {
			params: { folder_id: folderId, file_types: fileTypes },
		}),
	uploadToDrive: (filePath: string, folderId?: string) =>
		api.post('/gdrive/upload', { file_path: filePath, folder_id: folderId }),
	downloadFromDrive: (fileId: string, outputPath: string) =>
		api.post(`/gdrive/download/${fileId}`, { output_path: outputPath }),
	getDriveStorageUsage: () => api.get('/gdrive/storage'),
	setupProjectGoogleDrive: (projectName: string) =>
		api.post(`/projects/${projectName}/google-drive/setup`),
	backupProjectToDrive: (projectName: string, options?: any) =>
		api.post(`/projects/${projectName}/google-drive/backup`, options),
	getProjectDriveBackups: (projectName: string, limit?: number) =>
		api.get(`/projects/${projectName}/google-drive/backups`, {
			params: { limit },
		}),
	cleanupDriveBackups: (projectName: string, retentionDays?: number) =>
		api.post(`/projects/${projectName}/google-drive/cleanup`, {
			retention_days: retentionDays,
		}),

	// Cloudflare Integration
	getCloudflareStatus: async () => {
		await checkBackendAvailability();
		return api.get('/cloudflare/status');
	},
	connectCloudflare: async (apiToken: string) => {
		await checkBackendAvailability();
		return api.post('/cloudflare/connect', { api_token: apiToken });
	},
	disconnectCloudflare: async () => {
		await checkBackendAvailability();
		return api.delete('/cloudflare/disconnect');
	},
	getCloudflareZones: async () => {
		await checkBackendAvailability();
		return api.get('/cloudflare/zones');
	},
	syncCloudflare: async () => {
		await checkBackendAvailability();
		return api.post('/cloudflare/sync');
	},
	getExpiringItems: async (days: number = 30) => {
		await checkBackendAvailability();
		return api.get('/cloudflare/expiring', { params: { days } });
	},

	// Project Integrations
	updateGoogleDriveIntegration: (projectName: string, data: any) =>
		api.post(`/projects/${projectName}/google-drive-integration`, data),
	updateClientInfo: (projectName: string, data: any) =>
		api.post(`/projects/${projectName}/client-info`, data),
	getProjectPlugins: (projectName: string) =>
		api.get(`/projects/${projectName}/plugins`),
	getProjectThemes: (projectName: string) =>
		api.get(`/projects/${projectName}/themes`),

	// Plugin Updates
	updatePlugin: (projectName: string, pluginName: string) =>
		api.post(`/projects/${projectName}/plugins/${pluginName}/update`),
	updateAllPlugins: (projectName: string) =>
		api.post(`/projects/${projectName}/plugins/update-all`),

	// Theme Updates
	updateProjectTheme: (projectName: string, themeName: string) =>
		api.post(`/projects/${projectName}/themes/${themeName}/update`),
	updateAllThemes: (projectName: string) =>
		api.post(`/projects/${projectName}/themes/update-all`),

	// WordPress Core Updates
	updateWordPressCore: (projectName: string) =>
		api.post(`/projects/${projectName}/wordpress/update`),

	// Backup and Restore
	createBackup: (projectName: string, options?: any) =>
		api.post(`/dashboard/projects/${projectName}/backup`, options),
	restoreBackup: (projectName: string, restoreOptions: any) =>
		api.post(`/dashboard/projects/${projectName}/restore`, restoreOptions),
	listBackups: (projectName: string) =>
		api.get(`/dashboard/projects/${projectName}/backups`),

	// Bulk Operations
	bulkBackup: (projectIds: number[], backupOptions?: any) =>
		api.post('/backups/bulk', {
			project_ids: projectIds,
			...backupOptions,
		}),
	bulkDeleteBackups: (backupIds: number[], force?: boolean) =>
		api.delete('/backups/bulk', {
			data: { backup_ids: backupIds, force },
		}),
	bulkUpdatePlugins: (projectNames: string[], pluginNames?: string[]) =>
		api.post('/wp/updates/bulk', {
			update_type: 'plugin',
			project_server_ids: [], // Todo: frontend needs to map projectNames to IDs
		}),
	bulkStartDdev: (projectNames: string[]) =>
		api.post('/projects/bulk/ddev/start', {
			// Todo: Implement backend
			projects: projectNames,
		}),

	// Activity / Audit Logs
	getAuditLogs: (params?: {
		limit?: number;
		offset?: number;
		action?: string;
		entity_type?: string;
		hours?: number;
	}) => api.get('/activity', { params }),
	getActivitySummary: (hours?: number) =>
		api.get('/activity/summary', { params: { hours } }),

	// Clients
	getClients: () => api.get('/clients'),
	createClient: (clientData: any) => api.post('/clients', clientData),
	updateClient: (clientId: string, clientData: any) =>
		api.put(`/clients/${clientId}`, clientData),
	deleteClient: (clientId: string) => api.delete(`/clients/${clientId}`),
	assignClientToProject: (projectName: string, clientData: any) =>
		api.post(`/clients/${clientData.id}/assign-project`, {
			project_name: projectName,
		}), // Updated to match likely backend flow, but verify
	unassignClientFromProject: (projectName: string) =>
		api.delete(`/projects/${projectName}/unassign-client`), // Keep specific if implemented in projects, but likely clients related

	// Deployments
	promoteDeployment: (data: any) => api.post('/deployments/promote', data),
	getDeploymentHistory: () => api.get('/deployments/history'),
	rollbackDeployment: (projectName: string, target?: string) =>
		api.post(`/deployments/${projectName}/rollback`, {
			target_release: target,
		}),

	// Servers
	getServers: () => api.get('/servers'),
	createServer: (serverData: any) => api.post('/servers', serverData),
	updateServer: (serverId: number, serverData: any) =>
		api.put(`/servers/${serverId}`, serverData),
	deleteServer: (serverId: number) => api.delete(`/servers/${serverId}`),
	getServer: (serverId: number) => api.get(`/servers/${serverId}`),
	testServerConnection: (serverId: number) =>
		api.post(`/servers/${serverId}/test`),

	// CyberPanel
	verifyCyberPanel: (serverId: number) =>
		api.get(`/cyberpanel/servers/${serverId}/verify`),
	getCyberPanelWebsites: (serverId: number) =>
		api.get(`/cyberpanel/servers/${serverId}/websites`),
	getServerPanelLogin: (serverId: number) =>
		api.get(`/servers/${serverId}/panel/login-url`),
	createCyberPanelWebsite: (serverId: number, data: any) =>
		api.post(`/cyberpanel/servers/${serverId}/websites`, data),
	deleteCyberPanelWebsite: (serverId: number, domain: string) =>
		api.delete(`/cyberpanel/servers/${serverId}/websites/${domain}`),
	getCyberPanelDatabases: (serverId: number) =>
		api.get(`/cyberpanel/servers/${serverId}/databases`),
	createCyberPanelDatabase: (serverId: number, data: any) =>
		api.post(`/cyberpanel/servers/${serverId}/databases`, data),
	deleteCyberPanelDatabase: (serverId: number, dbName: string) =>
		api.delete(`/cyberpanel/servers/${serverId}/databases/${dbName}`),
	issueCyberPanelSSL: (serverId: number, domain: string) =>
		api.post(`/cyberpanel/servers/${serverId}/ssl/${domain}`),

	// Project Deploy
	deployFromGitHub: (projectName: string, repoUrl: string, branch?: string) =>
		api.post(`/projects/${projectName}/deploy/github`, {
			repo_url: repoUrl,
			branch: branch || 'main',
		}),

	// Site Cloning (between environments)
	cloneProject: (
		projectId: number,
		data: {
			source_env_id: number;
			target_server_id: number;
			target_domain: string;
			target_environment: string;
		}
	) => api.post(`/projects/${projectId}/clone`, data),

	// Project Backups
	getProjectBackups: (projectId: number) =>
		api.get(`/projects/${projectId}/backups`),

	// Import from CyberPanel
	getServerWebsites: (serverId: number) =>
		api.get(`/servers/${serverId}/websites`),
	importServerWebsite: (
		serverId: number,
		data: {
			domain: string;
			project_name?: string;
			environment?: string;
			create_monitor?: boolean;
		}
	) => api.post(`/servers/${serverId}/import`, data),
	importAllServerWebsites: (
		serverId: number,
		options?: {
			environment?: string;
			create_monitors?: boolean;
			wordpress_only?: boolean;
		}
	) => api.post(`/servers/${serverId}/import-all`, null, { params: options }),

	// Server Sync
	scanServerDirectories: (serverId: number, path?: string) =>
		api.post(`/servers/${serverId}/scan-directories`, null, {
			params: { base_path: path },
		}),
	getServerDirectories: (serverId: number) =>
		api.get(`/servers/${serverId}/directories`),
	scanServerSites: (serverId: number, basePath?: string) =>
		api.post(`/servers/${serverId}/scan-sites`, null, {
			params: { base_path: basePath || '/var/www' },
		}),
	readServerEnv: (serverId: number, path: string) =>
		api.post(`/servers/${serverId}/read-env`, null, {
			params: { path },
		}),

	// Schedules (Backup Schedules)
	getSchedules: (params?: {
		project_id?: number;
		status?: string;
		page?: number;
		page_size?: number;
	}) => api.get('/schedules', { params }),
	getSchedule: (scheduleId: number) => api.get(`/schedules/${scheduleId}`),
	createSchedule: (data: {
		name: string;
		project_id: number;
		frequency?: string;
		hour?: number;
		minute?: number;
		day_of_week?: number;
		day_of_month?: number;
		timezone?: string;
		cron_expression?: string;
		backup_type?: string;
		storage_type?: string;
		retention_count?: number;
		retention_days?: number;
		description?: string;
	}) => api.post('/schedules', data),
	updateSchedule: (
		scheduleId: number,
		data: {
			name?: string;
			frequency?: string;
			hour?: number;
			minute?: number;
			day_of_week?: number;
			day_of_month?: number;
			timezone?: string;
			cron_expression?: string;
			backup_type?: string;
			storage_type?: string;
			retention_count?: number;
			retention_days?: number;
			status?: string;
			description?: string;
		}
	) => api.patch(`/schedules/${scheduleId}`, data),
	deleteSchedule: (scheduleId: number) =>
		api.delete(`/schedules/${scheduleId}`),
	pauseSchedule: (scheduleId: number) =>
		api.post(`/schedules/${scheduleId}/pause`),
	resumeSchedule: (scheduleId: number) =>
		api.post(`/schedules/${scheduleId}/resume`),
	runScheduleNow: (scheduleId: number) =>
		api.post(`/schedules/${scheduleId}/run`),

	// Backups
	getBackups: (params?: {
		project_id?: number;
		backup_type?: string;
		status?: string;
		page?: number;
		page_size?: number;
	}) => api.get('/backups', { params }),
	getBackup: (backupId: number) => api.get(`/backups/${backupId}`),
	createManualBackup: (data: {
		project_id: number;
		backup_type?: string;
		storage_type?: string;
		name?: string;
	}) => api.post('/backups', data),
	deleteBackup: (backupId: number) => api.delete(`/backups/${backupId}`),
	downloadBackup: (backupId: number) =>
		api.get(`/backups/${backupId}/download`, { responseType: 'blob' }),
	restoreBackupFile: (
		backupId: number,
		options?: { database?: boolean; files?: boolean }
	) => api.post(`/backups/${backupId}/restore`, options),

	// Tasks
	getTaskStatus: (taskId: string) => api.get(`/projects/tasks/${taskId}`),

	// Configuration
	getDashboardConfig: async () => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.getDashboardConfig()
			: api.get('/dashboard/config');
	},
	updateDashboardConfig: async (config: any) => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.updateDashboardConfig(config)
			: api.put('/dashboard/config', config);
	},
	updateTheme: async (data: {
		theme: string;
		primary_color?: string;
		accent_color?: string;
	}) => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.updateTheme(
					data.theme,
					data.primary_color,
					data.accent_color
			  )
			: api.put('/dashboard/config/theme', data);
	},
	updateLayoutPreferences: async (preferences: any) => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.updateLayoutPreferences(preferences)
			: api.put('/dashboard/config/layout', preferences);
	},
	updateNotificationPreferences: async (preferences: any) => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.updateNotificationPreferences(preferences)
			: api.put('/dashboard/config/notifications', preferences);
	},
	getWidgetConfig: (widgetId: string) =>
		api.get(`/dashboard/config/widgets/${widgetId}`),
	updateWidgetConfig: (widgetId: string, config: any) =>
		api.put(`/dashboard/config/widgets/${widgetId}`, {
			widget_id: widgetId,
			config,
		}),
	resetConfiguration: async () => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.resetConfiguration()
			: api.post('/dashboard/config/reset');
	},
	exportConfiguration: async (exportPath: string) => {
		await checkBackendAvailability();
		return useMockApi
			? mockDashboardApi.exportConfiguration(exportPath)
			: api.post('/dashboard/config/export', null, {
					params: { export_path: exportPath },
			  });
	},
	importConfiguration: (importPath: string) =>
		api.post('/dashboard/config/import', null, {
			params: { import_path: importPath },
		}),

	// User Management
	getUsers: (search?: string) => api.get('/users', { params: { search } }),
	getUser: (id: number) => api.get(`/users/${id}`),
	createUser: (data: any) => api.post('/users', data),
	updateUser: (id: number, data: any) => api.patch(`/users/${id}`, data),
	deleteUser: (id: number) => api.delete(`/users/${id}`),
	resetUserPassword: (id: number, newPassword: string) =>
		api.post(`/users/${id}/reset-password`, { new_password: newPassword }),
	getCurrentUserPermissions: () => api.get('/users/me/permissions'),

	// Role Management
	getRoles: () => api.get('/rbac/roles'),
	getRole: (id: number) => api.get(`/rbac/roles/${id}`),
	createRole: (data: any) => api.post('/rbac/roles', data),
	updateRole: (id: number, data: any) => api.patch(`/rbac/roles/${id}`, data),
	deleteRole: (id: number) => api.delete(`/rbac/roles/${id}`),
	getPermissions: () => api.get('/rbac/permissions'),
	seedPermissions: () => api.post('/rbac/permissions/seed'),
	seedRoles: () => api.post('/rbac/roles/seed'),

	// Tags
	getTags: (search?: string) => api.get('/tags', { params: { search } }),
	getTag: (id: number) => api.get(`/tags/${id}`),
	createTag: (data: any) => api.post('/tags', data),
	updateTag: (id: number, data: any) => api.patch(`/tags/${id}`, data),
	deleteTag: (id: number) => api.delete(`/tags/${id}`),
	seedTags: () => api.post('/tags/seed'),

	// Notification Channels
	getNotificationChannels: () => api.get('/notifications/'),
	getNotificationChannel: (id: number) => api.get(`/notifications/${id}`),
	createNotificationChannel: (data: {
		name: string;
		channel_type: 'slack' | 'email' | 'telegram' | 'webhook' | 'discord';
		config: Record<string, any>;
		is_active?: boolean;
	}) => api.post('/notifications/', data),
	updateNotificationChannel: (
		id: number,
		data: {
			name?: string;
			config?: Record<string, any>;
			is_active?: boolean;
		}
	) => api.put(`/notifications/${id}`, data),
	deleteNotificationChannel: (id: number) => api.delete(`/notifications/${id}`),
	testNotificationChannel: (data: {
		channel_id?: number;
		channel_type?: 'slack' | 'email' | 'telegram' | 'webhook' | 'discord';
		config?: Record<string, any>;
	}) => api.post('/notifications/test', data),

	// Health
	getHealth: () => api.get('/dashboard/health'),

	// Security Scan
	runSecurityScan: (projectId: number) =>
		api.post(`/projects/${projectId}/security/scan`),

	// Composer Update/Install (Local DDEV)
	runComposerUpdate: (projectName: string) =>
		api.post(`/local/projects/${projectName}/composer/update`),
	runComposerInstall: (projectName: string) =>
		api.post(`/local/projects/${projectName}/composer/install`),

	// Backup Restore by ID (supports Google Drive)
	restoreBackupById: (backupId: number, target?: string) =>
		api.post(`/backups/${backupId}/restore`, { target: target || 'local' }),
};

export const settingsApi = {
	getSystemSSHKey: () => api.get('/settings/ssh-key'),
	updateSystemSSHKey: (privateKey: string) =>
		api.put('/settings/ssh-key', { private_key: privateKey }),
};

export default api;
