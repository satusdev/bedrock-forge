// Mock API service for testing without backend

interface MockDashboardApiType {
	getStats: () => Promise<any>;
	getProjects: () => Promise<any>;
	getComprehensiveProjects: () => Promise<any>;
	getGitHubAuthStatus: () => Promise<any>;
	getDriveStatus: () => Promise<any>;
	listDriveFolders: (params?: any) => Promise<any>;
	getDashboardConfig: () => Promise<any>;
	executeProjectAction: (
		projectName: string,
		action: string,
		data?: any,
	) => Promise<any>;
	updateDashboardConfig: (config: any) => Promise<any>;
	updateTheme: (
		theme: string,
		primaryColor?: string,
		accentColor?: string,
	) => Promise<any>;
	updateLayoutPreferences: (preferences: any) => Promise<any>;
	updateNotificationPreferences: (preferences: any) => Promise<any>;
	resetConfiguration: () => Promise<any>;
	exportConfiguration: (exportPath: string) => Promise<any>;
}

export const mockDashboardApi: MockDashboardApiType = {
	// Dashboard stats
	getStats: () =>
		Promise.resolve({
			data: {
				total_projects: 2,
				active_projects: 1,
				total_servers: 2,
				healthy_sites: 2,
				recent_deployments: 3,
				failed_backups: 0,
				github_authenticated: false,
				google_drive_authenticated: false,
			},
		}),

	// Projects
	getProjects: () =>
		Promise.resolve({
			data: [
				{ id: 1, name: 'Test Blog', slug: 'test-blog', status: 'active' },
				{
					id: 2,
					name: 'Company Site',
					slug: 'company-site',
					status: 'inactive',
				},
			],
		}),
	getComprehensiveProjects: () =>
		Promise.resolve({
			data: [
				{
					id: 'test-project-1',
					project_name: 'Test Blog',
					directory: '/home/user/projects/Test Blog',
					status: 'active',
					health_score: 95,
					project_type: 'wordpress',
					environments: {
						local: {
							type: 'local',
							url: 'http://test-blog.ddev.site',
							wordpress_version: '6.4.3',
							php_version: '8.1',
							database_name: 'test_blog_local',
							health_score: 92,
						},
					},
					github: {
						connected: true,
						repository_url: 'https://github.com/user/test-blog.git',
					},
					google_drive: {
						connected: false,
					},
					client: {
						name: 'Test Client',
						email: 'client@example.com',
						billing_status: 'active',
						monthly_rate: 500,
					},
					updated_at: '2024-01-15T10:30:00Z',
				},
				{
					id: 'test-project-2',
					project_name: 'Company Site',
					directory: '/home/user/projects/Company Site',
					status: 'inactive',
					health_score: 88,
					project_type: 'wordpress',
					environments: {
						local: {
							type: 'local',
							url: 'http://company-site.ddev.site',
							wordpress_version: '6.3.1',
							php_version: '8.0',
							database_name: 'company_site_local',
							health_score: 85,
						},
					},
					github: {
						connected: false,
					},
					google_drive: {
						connected: true,
						backup_folder_id: 'WebDev/Projects/Company Site/Backups/Staging',
					},
					updated_at: '2024-01-14T15:45:00Z',
				},
			],
		}),

	// GitHub auth status
	getGitHubAuthStatus: () =>
		Promise.resolve({
			data: {
				authenticated: false,
			},
		}),

	// Google Drive (rclone) status
	getDriveStatus: () =>
		Promise.resolve({
			data: {
				configured: false,
				message: 'rclone not configured',
				remote_name: 'gdrive',
				base_path: 'WebDev/Projects',
			},
		}),

	listDriveFolders: () =>
		Promise.resolve({
			data: {
				folders: [],
				count: 0,
				remote_name: 'gdrive',
				base_path: 'WebDev/Projects',
			},
		}),

	// Dashboard configuration
	getDashboardConfig: () =>
		Promise.resolve({
			data: {
				theme: 'light',
				primary_color: '#3b82f6',
				accent_color: '#10b981',
				sidebar_collapsed: false,
				show_advanced_options: false,
				auto_refresh_enabled: true,
				auto_refresh_interval: 30,
				notifications_enabled: true,
				notification_types: {
					deployment_complete: true,
					backup_success: true,
					backup_failure: true,
					site_health_warning: true,
					ssl_expiry_warning: true,
					plugin_updates: true,
				},
				widgets: {
					stats_overview: { enabled: true, position: 'top', order: 1 },
					project_health: { enabled: true, position: 'left', order: 2 },
					recent_activity: { enabled: true, position: 'right', order: 3 },
					quick_actions: { enabled: true, position: 'left', order: 4 },
					upcoming_tasks: { enabled: false, position: 'right', order: 5 },
				},
				default_project_view: 'grid',
				projects_per_page: 12,
				show_project_health_scores: true,
				show_backup_status: true,
				gdrive_rclone_remote: 'gdrive',
				gdrive_base_path: 'WebDev/Projects',
				api_rate_limit: 100,
				request_timeout: 30,
				session_timeout: 3600,
				require_auth_for_sensitive_actions: true,
				debug_mode: false,
				log_level: 'INFO',
			},
		}),

	// Project actions
	executeProjectAction: (projectName: string, action: string, data?: any) => {
		console.log(`Mock: Executing ${action} on ${projectName}`, data);
		return Promise.resolve({
			data: {
				status: 'success',
				message: `Action ${action} executed successfully on ${projectName}`,
			},
		});
	},

	updateDashboardConfig: (config: any) => {
		console.log('Mock: Updating dashboard config', config);
		return Promise.resolve({
			data: {
				status: 'success',
				message: 'Configuration updated successfully',
			},
		});
	},

	updateTheme: (theme: string, primaryColor?: string, accentColor?: string) => {
		console.log('Mock: Updating theme', { theme, primaryColor, accentColor });
		return Promise.resolve({
			data: { status: 'success', message: 'Theme updated successfully' },
		});
	},

	updateLayoutPreferences: (preferences: any) => {
		console.log('Mock: Updating layout preferences', preferences);
		return Promise.resolve({
			data: {
				status: 'success',
				message: 'Layout preferences updated successfully',
			},
		});
	},

	updateNotificationPreferences: (preferences: any) => {
		console.log('Mock: Updating notification preferences', preferences);
		return Promise.resolve({
			data: {
				status: 'success',
				message: 'Notification preferences updated successfully',
			},
		});
	},

	resetConfiguration: () => {
		console.log('Mock: Resetting configuration');
		return Promise.resolve({
			data: {
				status: 'success',
				message: 'Configuration reset to defaults successfully',
			},
		});
	},

	exportConfiguration: (exportPath: string) => {
		console.log('Mock: Exporting configuration to', exportPath);
		return Promise.resolve({
			data: {
				status: 'success',
				message: `Configuration exported to ${exportPath}`,
			},
		});
	},
};

export default mockDashboardApi;
