import axios from 'axios'
import toast from 'react-hot-toast'
import { mockDashboardApi } from './mockApi'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Flag to use mock API when backend is not available
let useMockApi = false

// Check if backend is available
const checkBackendAvailability = async () => {
  try {
    await api.get('/health')
    useMockApi = false
  } catch (error) {
    console.log('Backend not available, using mock API')
    useMockApi = true
  }
}

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'An error occurred'
    const status = error.response?.status
    const errorCode = error.response?.data?.error_code

    // Enhanced error categorization
    let toastMessage = message
    let toastType: 'error' | 'warning' | 'info' = 'error'

    // Handle different error types
    if (status === 401) {
      toastMessage = 'Authentication required. Please log in again.'
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    } else if (status === 403) {
      toastMessage = 'Access denied. You do not have permission to perform this action.'
    } else if (status === 404) {
      toastMessage = 'The requested resource was not found.'
      toastType = 'warning'
    } else if (status === 409) {
      toastMessage = 'Conflict: The operation could not be completed due to a conflict.'
      toastType = 'warning'
    } else if (status === 422) {
      toastMessage = 'Validation error: Please check your input and try again.'
      toastType = 'warning'
    } else if (status === 429) {
      toastMessage = 'Too many requests. Please wait a moment and try again.'
      toastType = 'info'
    } else if (status && status >= 500) {
      toastMessage = 'Server error. Please try again later or contact support if the problem persists.'
    } else if (!status) {
      // Network error
      toastMessage = 'Network error. Please check your connection and try again.'
    }

    // Handle specific error codes
    if (errorCode === 'BACKUP_IN_PROGRESS') {
      toastMessage = 'A backup is already in progress for this project.'
      toastType = 'warning'
    } else if (errorCode === 'DDEV_NOT_RUNNING') {
      toastMessage = 'DDEV is not running for this project. Please start DDEV first.'
      toastType = 'warning'
    } else if (errorCode === 'WORDPRESS_ERROR') {
      toastMessage = 'WordPress error occurred. Please check the WordPress configuration.'
    } else if (errorCode === 'PLUGIN_UPDATE_FAILED') {
      toastMessage = 'Plugin update failed. Please check the plugin compatibility.'
    } else if (errorCode === 'BULK_OPERATION_LIMIT') {
      toastMessage = 'Too many projects selected for bulk operation. Please select fewer projects.'
      toastType = 'warning'
    }

    // Show appropriate toast
    if (status >= 400 && status !== 401) {
      if (toastType === 'error') {
        toast.error(toastMessage, { duration: 5000 })
      } else if (toastType === 'warning') {
        toast.warning(toastMessage, { duration: 4000 })
      } else {
        toast(toastMessage, { duration: 3000 })
      }
    }

    return Promise.reject(error)
  }
)

// Dashboard API
export const dashboardApi = {
  // Dashboard stats
  getStats: async () => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.getStats() : api.get('/dashboard/stats')
  },

  // Projects
  getProjects: async () => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.getProjects() : api.get('/dashboard/projects')
  },
  getComprehensiveProjects: async () => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.getComprehensiveProjects() : api.get('/dashboard/projects/comprehensive')
  },
  getProjectStatus: async (projectName: string) => {
    await checkBackendAvailability()
    return useMockApi ? Promise.resolve({ data: {} }) : api.get(`/dashboard/projects/${projectName}/status`)
  },
  executeProjectAction: async (projectName: string, action: string, data?: any) => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.executeProjectAction(projectName, action, data) :
      api.post(`/dashboard/projects/${projectName}/action`, { action, ...data })
  },

  // GitHub Integration
  getGitHubAuthStatus: async () => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.getGitHubAuthStatus() : api.get('/dashboard/github/auth/status')
  },
  authenticateGitHub: (token: string) => api.post('/dashboard/github/auth', { access_token: token }),
  getRepositoryInfo: (repoUrl: string) => api.get(`/dashboard/github/repository/${encodeURIComponent(repoUrl)}/info`),
  getRepositoryBranches: (repoUrl: string) => api.get(`/dashboard/github/repository/${encodeURIComponent(repoUrl)}/branches`),
  getRepositoryCommits: (repoUrl: string, branch?: string, limit?: number) =>
    api.get(`/dashboard/github/repository/${encodeURIComponent(repoUrl)}/commits`, { params: { branch, limit } }),
  getRepositoryPullRequests: (repoUrl: string, state?: string) =>
    api.get(`/dashboard/github/repository/${encodeURIComponent(repoUrl)}/pull-requests`, { params: { state } }),
  getRepositoryDeployments: (repoUrl: string, environment?: string) =>
    api.get(`/dashboard/github/repository/${encodeURIComponent(repoUrl)}/deployments`, { params: { environment } }),
  cloneRepository: (repoUrl: string, targetPath: string, branch?: string) =>
    api.post(`/dashboard/github/repository/${encodeURIComponent(repoUrl)}/clone`, { target_path: targetPath, branch }),
  pullRepository: (projectName: string, branch?: string) =>
    api.post(`/dashboard/projects/${projectName}/git/pull`, { branch }),
  getRepositoryStatus: (projectName: string) => api.get(`/dashboard/projects/${projectName}/git/status`),
  createWebhook: (repoUrl: string, webhookUrl: string, events?: string[]) =>
    api.post('/dashboard/github/webhook/create', { repository_url: repoUrl, webhook_url: webhookUrl, events }),
  getWebhooks: (repoUrl: string) => api.get(`/dashboard/github/webhooks/${encodeURIComponent(repoUrl)}`),
  createDeployment: (repoUrl: string, ref: string, environment: string, description?: string) =>
    api.post('/dashboard/github/deployment/create', { repository_url: repoUrl, ref, environment, description }),

  // Google Drive Integration
  getGoogleDriveAuthStatus: async () => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.getGoogleDriveAuthStatus() : api.get('/dashboard/google-drive/auth/status')
  },
  authenticateGoogleDrive: () => api.post('/dashboard/google-drive/auth'),
  createDriveFolder: (folderName: string, parentFolderId?: string) =>
    api.post('/dashboard/google-drive/folder', { folder_name: folderName, parent_folder_id: parentFolderId }),
  listDriveFiles: (folderId?: string, fileTypes?: string[]) =>
    api.get('/dashboard/google-drive/folder/files', { params: { folder_id: folderId, file_types: fileTypes } }),
  uploadToDrive: (filePath: string, folderId?: string) =>
    api.post('/dashboard/google-drive/upload', { file_path: filePath, folder_id: folderId }),
  downloadFromDrive: (fileId: string, outputPath: string) =>
    api.post(`/dashboard/google-drive/download/${fileId}`, { output_path: outputPath }),
  getDriveStorageUsage: () => api.get('/dashboard/google-drive/storage'),
  setupProjectGoogleDrive: (projectName: string) =>
    api.post(`/dashboard/projects/${projectName}/google-drive/setup`),
  backupProjectToDrive: (projectName: string, options?: any) =>
    api.post(`/dashboard/projects/${projectName}/google-drive/backup`, options),
  getProjectDriveBackups: (projectName: string, limit?: number) =>
    api.get(`/dashboard/projects/${projectName}/google-drive/backups`, { params: { limit } }),
  cleanupDriveBackups: (projectName: string, retentionDays?: number) =>
    api.post(`/dashboard/projects/${projectName}/google-drive/cleanup`, { retention_days: retentionDays }),

  // Project Integrations
  updateGoogleDriveIntegration: (projectName: string, data: any) =>
    api.post(`/dashboard/projects/${projectName}/google-drive-integration`, data),
  updateClientInfo: (projectName: string, data: any) =>
    api.post(`/dashboard/projects/${projectName}/client-info`, data),
  getProjectPlugins: (projectName: string) => api.get(`/dashboard/projects/${projectName}/plugins`),
  getProjectThemes: (projectName: string) => api.get(`/dashboard/projects/${projectName}/themes`),

  // Plugin Updates
  updatePlugin: (projectName: string, pluginName: string) =>
    api.post(`/dashboard/projects/${projectName}/plugins/${pluginName}/update`),
  updateAllPlugins: (projectName: string) =>
    api.post(`/dashboard/projects/${projectName}/plugins/update-all`),

  // Theme Updates
  updateTheme: (projectName: string, themeName: string) =>
    api.post(`/dashboard/projects/${projectName}/themes/${themeName}/update`),
  updateAllThemes: (projectName: string) =>
    api.post(`/dashboard/projects/${projectName}/themes/update-all`),

  // WordPress Core Updates
  updateWordPressCore: (projectName: string) =>
    api.post(`/dashboard/projects/${projectName}/wordpress/core/update`),

  // Backup and Restore
  createBackup: (projectName: string, options?: any) =>
    api.post(`/dashboard/projects/${projectName}/backup`, options),
  restoreBackup: (projectName: string, restoreOptions: any) =>
    api.post(`/dashboard/projects/${projectName}/restore`, restoreOptions),
  listBackups: (projectName: string) =>
    api.get(`/dashboard/projects/${projectName}/backups`),

  // Bulk Operations
  bulkBackup: (projectNames: string[], backupOptions?: any) =>
    api.post('/dashboard/bulk/backup', {
      projects: projectNames,
      backup_options: backupOptions
    }),
  bulkUpdatePlugins: (projectNames: string[], pluginNames?: string[]) =>
    api.post('/dashboard/bulk/updates/plugins', {
      projects: projectNames,
      plugins: pluginNames
    }),
  bulkStartDdev: (projectNames: string[]) =>
    api.post('/dashboard/bulk/ddev/start', {
      projects: projectNames
    }),

  // Clients
  getClients: () => api.get('/dashboard/clients'),
  createClient: (clientData: any) => api.post('/dashboard/clients', clientData),
  updateClient: (clientId: string, clientData: any) => api.put(`/dashboard/clients/${clientId}`, clientData),
  deleteClient: (clientId: string) => api.delete(`/dashboard/clients/${clientId}`),
  assignClientToProject: (projectName: string, clientData: any) =>
    api.post(`/dashboard/projects/${projectName}/assign-client`, clientData),
  unassignClientFromProject: (projectName: string) =>
    api.delete(`/dashboard/projects/${projectName}/unassign-client`),

  // Tasks
  getTaskStatus: (taskId: string) => api.get(`/dashboard/tasks/${taskId}`),

  // Configuration
  getDashboardConfig: async () => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.getDashboardConfig() : api.get('/dashboard/config')
  },
  updateDashboardConfig: async (config: any) => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.updateDashboardConfig(config) : api.put('/dashboard/config', config)
  },
  updateTheme: async (theme: string, primaryColor?: string, accentColor?: string) => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.updateTheme(theme, primaryColor, accentColor) :
      api.put('/dashboard/config/theme', { theme, primary_color: primaryColor, accent_color: accentColor })
  },
  updateLayoutPreferences: async (preferences: any) => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.updateLayoutPreferences(preferences) :
      api.put('/dashboard/config/layout', preferences)
  },
  updateNotificationPreferences: async (preferences: any) => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.updateNotificationPreferences(preferences) :
      api.put('/dashboard/config/notifications', preferences)
  },
  getWidgetConfig: (widgetId: string) => api.get(`/dashboard/config/widgets/${widgetId}`),
  updateWidgetConfig: (widgetId: string, config: any) =>
    api.put(`/dashboard/config/widgets/${widgetId}`, { widget_id: widgetId, config }),
  resetConfiguration: async () => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.resetConfiguration() : api.post('/dashboard/config/reset')
  },
  exportConfiguration: async (exportPath: string) => {
    await checkBackendAvailability()
    return useMockApi ? mockDashboardApi.exportConfiguration(exportPath) :
      api.post('/dashboard/config/export', null, { params: { export_path: exportPath } })
  },
  importConfiguration: (importPath: string) =>
    api.post('/dashboard/config/import', null, { params: { import_path: importPath} }),

  // Health
  getHealth: () => api.get('/dashboard/health'),
}

export default api