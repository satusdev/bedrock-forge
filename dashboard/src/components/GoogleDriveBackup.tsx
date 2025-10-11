import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HardDrive,
  Cloud,
  Calendar,
  Clock,
  Download,
  Upload,
  Settings,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  X,
  Search,
  Filter,
  FolderOpen,
  File,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  Activity,
  TrendingUp,
  Database,
  Image,
  FileText,
  Archive,
  Plus,
  FolderPlus,
  Share2,
  ChevronRight,
  ChevronLeft,
  Home,
  Grid3X3,
  List,
  Eye,
  Edit,
  Copy,
  Move
} from 'lucide-react'
import { dashboardApi } from '@/services/api'
import { useDashboardStore } from '@/store/useDashboardStore'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface GoogleDriveBackupProps {
  project: any
}

const GoogleDriveBackup: React.FC<GoogleDriveBackupProps> = ({ project }) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedBackup, setSelectedBackup] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showBackupOptions, setShowBackupOptions] = useState(false)
  const [backupOptions, setBackupOptions] = useState({
    database: true,
    uploads: true,
    themes: true,
    plugins: true
  })

  // Enhanced file management states
  const [currentFolderId, setCurrentFolderId] = useState<string>('')
  const [currentFolderPath, setCurrentFolderPath] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<any[]>([])
  const [showAuthForm, setShowAuthForm] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({})

  const queryClient = useQueryClient()
  const { setTaskStatus } = useDashboardStore()

  // Check Google Drive auth status
  const { data: authStatus } = useQuery(
    ['google-drive-auth-status'],
    dashboardApi.getGoogleDriveAuthStatus,
    {
      refetchInterval: 30000, // Check every 30 seconds
    }
  )

  // Get storage usage
  const { data: storageUsage } = useQuery(
    'google-drive-storage',
    dashboardApi.getDriveStorageUsage,
    {
      enabled: authStatus?.data?.authenticated,
      refetchInterval: 60000, // Check every minute
    }
  )

  // Get backup history
  const { data: backupHistory } = useQuery(
    ['google-drive-backups', project.project_name],
    () => dashboardApi.getProjectDriveBackups(project.project_name, 20),
    {
      enabled: !!(project.project_name && authStatus?.data?.authenticated),
      refetchInterval: 30000, // Check every 30 seconds
    }
  )

  // Get Google Drive files if backup folder exists
  const { data: driveFiles } = useQuery(
    ['google-drive-files', project.google_drive?.backup_folder_id],
    () => dashboardApi.listDriveFiles(project.google_drive?.backup_folder_id),
    {
      enabled: !!(project.google_drive?.backup_folder_id && authStatus?.data?.authenticated),
    }
  )

  // Backup mutations
  const createBackup = useMutation(
    (options: any) => dashboardApi.backupProjectToDrive(project.project_name, options),
    {
      onSuccess: (response) => {
        const taskId = response.data.task_id
        if (taskId) {
          // Poll for task completion
          const interval = setInterval(async () => {
            try {
              const taskResponse = await dashboardApi.getTaskStatus(taskId)
              const taskData = taskResponse.data

              setTaskStatus(taskId, taskData)

              if (taskData.status === 'completed' || taskData.status === 'failed') {
                clearInterval(interval)
                queryClient.invalidateQueries(['google-drive-backups', project.project_name])
                queryClient.invalidateQueries('google-drive-storage')
              }
            } catch (error) {
              clearInterval(interval)
            }
          }, 2000)
        }
        setShowBackupOptions(false)
      },
    }
  )

  // Cleanup backups mutation
  const cleanupBackups = useMutation(
    (retentionDays: number) => dashboardApi.cleanupDriveBackups(project.project_name, retentionDays),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['google-drive-backups', project.project_name])
        queryClient.invalidateQueries('google-drive-storage')
      },
    }
  )

  // Setup Google Drive integration
  const setupIntegration = useMutation(
    () => dashboardApi.setupProjectGoogleDrive(project.project_name),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['comprehensive-project', project.project_name])
      },
    }
  )

  // Enhanced file management mutations
  const authenticateGoogleDrive = useMutation(
    () => dashboardApi.authenticateGoogleDrive(),
    {
      onSuccess: () => {
        setShowAuthForm(false)
        queryClient.invalidateQueries(['google-drive-auth-status'])
        toast.success('Google Drive authentication successful!')
      },
      onError: (error: any) => {
        toast.error(`Google Drive authentication failed: ${error.message}`)
      }
    }
  )

  const uploadFile = useMutation(
    (fileData: { file: File, folderId?: string }) =>
      dashboardApi.uploadToDrive(fileData.file.path || fileData.file.name, fileData.folderId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['google-drive-files', currentFolderId])
        setUploadFiles(null)
        setShowUploadModal(false)
        toast.success('File uploaded successfully!')
      },
      onError: (error: any) => {
        toast.error(`Upload failed: ${error.message}`)
      }
    }
  )

  const createFolder = useMutation(
    (folderData: { name: string, parentFolderId?: string }) =>
      dashboardApi.createDriveFolder(folderData.name, folderData.parentFolderId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['google-drive-files', currentFolderId])
        setNewFolderName('')
        setShowCreateFolderModal(false)
        toast.success('Folder created successfully!')
      },
      onError: (error: any) => {
        toast.error(`Failed to create folder: ${error.message}`)
      }
    }
  )

  const downloadFile = useMutation(
    (fileData: { fileId: string, outputPath: string }) =>
      dashboardApi.downloadFromDrive(fileData.fileId, fileData.outputPath),
    {
      onSuccess: () => {
        toast.success('File downloaded successfully!')
      },
      onError: (error: any) => {
        toast.error(`Download failed: ${error.message}`)
      }
    }
  )

  const isAuthenticated = authStatus?.data?.authenticated
  const isIntegrated = !!project.google_drive?.backup_folder_id
  const storageData = storageUsage?.data?.storage_usage
  const backupsData = backupHistory?.data?.backups || []
  const filesData = driveFiles?.data?.files || []

  const handleStartBackup = () => {
    createBackup.mutate(backupOptions)
  }

  const handleCleanup = (retentionDays: number) => {
    if (window.confirm(`Are you sure you want to delete backups older than ${retentionDays} days?`)) {
      cleanupBackups.mutate(retentionDays)
    }
  }

  const handleSetupIntegration = () => {
    setupIntegration.mutate()
  }

  // Enhanced file management handlers
  const handleAuthenticateGoogleDrive = () => {
    authenticateGoogleDrive.mutate()
  }

  const handleFileUpload = () => {
    if (!uploadFiles || uploadFiles.length === 0) {
      toast.error('Please select files to upload')
      return
    }

    Array.from(uploadFiles).forEach((file) => {
      uploadFile.mutate({
        file,
        folderId: currentFolderId || project.google_drive?.backup_folder_id
      })
    })
  }

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name')
      return
    }

    createFolder.mutate({
      name: newFolderName,
      parentFolderId: currentFolderId || project.google_drive?.backup_folder_id
    })
  }

  const handleDownloadFile = (file: any) => {
    const outputPath = `/tmp/${file.name}`
    downloadFile.mutate({
      fileId: file.id,
      outputPath
    })
  }

  const handleNavigateToFolder = (folder: any) => {
    setCurrentFolderId(folder.id)
    setCurrentFolderPath([...currentFolderPath, { id: folder.id, name: folder.name }])
    queryClient.invalidateQueries(['google-drive-files', folder.id])
  }

  const handleNavigateUp = () => {
    if (currentFolderPath.length > 0) {
      const newPath = [...currentFolderPath]
      newPath.pop()
      setCurrentFolderPath(newPath)

      const parentFolderId = newPath.length > 0 ? newPath[newPath.length - 1].id : project.google_drive?.backup_folder_id || ''
      setCurrentFolderId(parentFolderId)
      queryClient.invalidateQueries(['google-drive-files', parentFolderId])
    }
  }

  const handleNavigateToRoot = () => {
    setCurrentFolderId(project.google_drive?.backup_folder_id || '')
    setCurrentFolderPath([])
    queryClient.invalidateQueries(['google-drive-files', project.google_drive?.backup_folder_id || ''])
  }

  const handleFileSelect = (file: any) => {
    setSelectedFiles(prev =>
      prev.find(f => f.id === file.id)
        ? prev.filter(f => f.id !== file.id)
        : [...prev, file]
    )
  }

  const handleSelectAll = () => {
    if (selectedFiles.length === filesData.length) {
      setSelectedFiles([])
    } else {
      setSelectedFiles(filesData)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('folder')) return FolderOpen
    if (mimeType.includes('image')) return Image
    if (mimeType.includes('text') || mimeType.includes('document')) return FileText
    if (mimeType.includes('zip') || mimeType.includes('archive')) return Archive
    return File
  }

  const getStorageColor = (usagePercent: number) => {
    if (usagePercent >= 90) return 'text-red-600 bg-red-100'
    if (usagePercent >= 75) return 'text-yellow-600 bg-yellow-100'
    return 'text-green-600 bg-green-100'
  }

  const filteredBackups = backupsData.filter((backup: any) =>
    backup.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Activity },
    { id: 'backups', name: 'Backup History', icon: Calendar },
    { id: 'files', name: 'File Management', icon: FolderOpen },
    { id: 'settings', name: 'Settings', icon: Settings },
  ]

  if (!isAuthenticated) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-12">
            <Cloud className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Google Drive Not Connected</h3>
            <p className="text-gray-500 mb-6">Connect your Google Drive account to enable cloud backup and file management features.</p>
            {!showAuthForm ? (
              <Button variant="primary" onClick={() => setShowAuthForm(true)}>
                <Cloud className="w-4 h-4 mr-2" />
                Connect Google Drive
              </Button>
            ) : (
              <div className="max-w-md mx-auto text-left">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 mr-2" />
                    <div>
                      <h4 className="text-sm font-medium text-blue-800">OAuth2 Authentication</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        You'll be redirected to Google to authorize Bedrock Forge to access your Google Drive.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="primary"
                    onClick={handleAuthenticateGoogleDrive}
                    disabled={authenticateGoogleDrive.isLoading}
                  >
                    {authenticateGoogleDrive.isLoading ? 'Authenticating...' : 'Authorize with Google'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowAuthForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  if (!isIntegrated) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-12">
            <HardDrive className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Backup Not Configured</h3>
            <p className="text-gray-500 mb-6">Set up Google Drive backup integration for this project.</p>
            <Button variant="primary" onClick={handleSetupIntegration} disabled={setupIntegration.isLoading}>
              {setupIntegration.isLoading ? 'Setting up...' : 'Setup Backup Integration'}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Storage Overview */}
      {storageData && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{formatFileSize(storageData.usage)}</div>
              <p className="text-sm text-gray-500">Used Storage</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{formatFileSize(storageData.limit)}</div>
              <p className="text-sm text-gray-500">Total Storage</p>
            </div>
            <div className="text-center">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStorageColor(storageData.usage_percent)}`}>
                {storageData.usage_percent.toFixed(1)}% Full
              </div>
              <p className="text-sm text-gray-500 mt-1">Storage Usage</p>
            </div>
          </div>

          {/* Storage Progress Bar */}
          <div className="mt-6">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  storageData.usage_percent >= 90 ? 'bg-red-600' :
                  storageData.usage_percent >= 75 ? 'bg-yellow-600' : 'bg-green-600'
                }`}
                style={{ width: `${Math.min(storageData.usage_percent, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{formatFileSize(storageData.usage)}</span>
              <span>{formatFileSize(storageData.limit)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Backup Status */}
      <Card title="Backup Status">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium">Last Backup</span>
            <span className="text-sm text-gray-600">
              {project.google_drive?.last_backup ?
                new Date(project.google_drive.last_backup).toLocaleDateString() :
                'Never'
              }
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium">Total Backups</span>
            <span className="text-sm text-gray-600">{backupsData.length}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium">Schedule</span>
            <Badge variant="info">{project.google_drive?.backup_schedule || 'Daily'}</Badge>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium">Auto Backup</span>
            <Badge variant={project.google_drive?.auto_backup ? 'success' : 'warning'}>
              {project.google_drive?.auto_backup ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={() => setShowBackupOptions(true)}
            disabled={createBackup.isLoading}
          >
            <Upload className="w-4 h-4 mr-2" />
            Create Backup
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleCleanup(30)}
            disabled={cleanupBackups.isLoading}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Cleanup Old
          </Button>
          <Button
            variant="secondary"
            onClick={() => queryClient.invalidateQueries(['google-drive-backups', project.project_name])}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Backup Options Modal */}
      {showBackupOptions && (
        <Card title="Backup Options">
          <div className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={backupOptions.database}
                  onChange={(e) => setBackupOptions({...backupOptions, database: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium">Database</span>
              </label>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={backupOptions.uploads}
                  onChange={(e) => setBackupOptions({...backupOptions, uploads: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium">Uploads (Media Files)</span>
              </label>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={backupOptions.themes}
                  onChange={(e) => setBackupOptions({...backupOptions, themes: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium">Themes</span>
              </label>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={backupOptions.plugins}
                  onChange={(e) => setBackupOptions({...backupOptions, plugins: e.target.checked})}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium">Plugins</span>
              </label>
            </div>

            <div className="flex space-x-3">
              <Button
                variant="primary"
                onClick={handleStartBackup}
                disabled={createBackup.isLoading}
              >
                {createBackup.isLoading ? 'Starting Backup...' : 'Start Backup'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowBackupOptions(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <nav className="flex space-x-8 px-6 border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            )
          })}
        </nav>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Recent Backups">
                  <div className="space-y-3">
                    {backupsData.slice(0, 5).map((backup: any, index: number) => (
                      <div key={backup.backup_id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{backup.name}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(backup.created_time).toLocaleDateString()} • {backup.file_count} files • {formatFileSize(backup.total_size)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <a href={backup.url} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    ))}
                    {backupsData.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No backups yet</p>
                      </div>
                    )}
                  </div>
                </Card>

                <Card title="Backup Statistics">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Total Size</span>
                      <span className="text-sm text-gray-600">
                        {formatFileSize(backupsData.reduce((sum: number, backup: any) => sum + backup.total_size, 0))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Average Size</span>
                      <span className="text-sm text-gray-600">
                        {backupsData.length > 0 ?
                          formatFileSize(backupsData.reduce((sum: number, backup: any) => sum + backup.total_size, 0) / backupsData.length) :
                          '0 B'
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Largest Backup</span>
                      <span className="text-sm text-gray-600">
                        {backupsData.length > 0 ?
                          formatFileSize(Math.max(...backupsData.map((b: any) => b.total_size))) :
                          '0 B'
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Backup Frequency</span>
                      <Badge variant="info">{project.google_drive?.backup_schedule || 'Daily'}</Badge>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Backup History Tab */}
          {activeTab === 'backups' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search backups..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <Button variant="secondary" size="sm">
                  <Filter className="w-4 h-4 mr-1" />
                  Filter
                </Button>
              </div>

              <div className="space-y-3">
                {filteredBackups.map((backup: any, index: number) => (
                  <div key={backup.backup_id || index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <Archive className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{backup.name}</p>
                          <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                            <span>{new Date(backup.created_time).toLocaleDateString()}</span>
                            <span>{backup.file_count} files</span>
                            <span>{formatFileSize(backup.total_size)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="secondary" size="sm">
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      <a href={backup.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="secondary" size="sm">
                          <ExternalLink className="w-4 h-4 mr-1" />
                          View
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}
                {filteredBackups.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No backups found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* File Management Tab */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              {/* File Management Toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {/* Breadcrumb Navigation */}
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleNavigateToRoot}
                      className="p-1"
                    >
                      <Home className="w-4 h-4" />
                    </Button>
                    {currentFolderPath.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleNavigateUp}
                        className="p-1"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                    )}
                    <span className="text-sm text-gray-600">
                      {currentFolderPath.length > 0
                        ? currentFolderPath.map(f => f.name).join(' / ')
                        : 'Root Folder'
                      }
                    </span>
                  </div>

                  {/* View Mode Toggle */}
                  <div className="flex items-center bg-gray-100 rounded-lg p-1">
                    <Button
                      variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="p-1"
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="p-1"
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCreateFolderModal(true)}
                  >
                    <FolderPlus className="w-4 h-4 mr-1" />
                    New Folder
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowUploadModal(true)}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Upload Files
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => queryClient.invalidateQueries(['google-drive-files', currentFolderId])}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* File Selection Controls */}
              {selectedFiles.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-800">
                      {selectedFiles.length} item{selectedFiles.length !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex items-center space-x-2">
                      <Button variant="secondary" size="sm">
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      <Button variant="secondary" size="sm">
                        <Move className="w-4 h-4 mr-1" />
                        Move
                      </Button>
                      <Button variant="secondary" size="sm">
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Files and Folders Display */}
              <div className={viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4' : 'space-y-2'}>
                {/* Select All Checkbox (for list view) */}
                {viewMode === 'list' && filesData.length > 0 && (
                  <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                    <input
                      type="checkbox"
                      checked={selectedFiles.length === filesData.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Select All</span>
                  </div>
                )}

                {filesData.map((item: any, index: number) => {
                  const Icon = getFileIcon(item.mime_type)
                  const isSelected = selectedFiles.find(f => f.id === item.id)
                  const isFolder = item.mime_type?.includes('folder')

                  return (
                    <div
                      key={item.id || index}
                      className={`
                        ${viewMode === 'grid'
                          ? 'flex flex-col items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors'
                          : 'flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors'
                        }
                        ${isSelected ? 'ring-2 ring-primary-500 bg-primary-50' : ''}
                      `}
                      onClick={() => {
                        if (isFolder) {
                          handleNavigateToFolder(item)
                        } else {
                          handleFileSelect(item)
                        }
                      }}
                    >
                      <div className={viewMode === 'grid' ? 'flex flex-col items-center space-y-2' : 'flex items-center space-x-3 flex-1'}>
                        {/* Selection Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleFileSelect(item)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />

                        {/* File/Folder Icon */}
                        <Icon className={`${viewMode === 'grid' ? 'w-8 h-8' : 'w-5 h-5'} text-gray-400`} />

                        {/* File/Folder Info */}
                        <div className={viewMode === 'grid' ? 'text-center' : 'flex-1'}>
                          <p className={`text-sm font-medium text-gray-900 ${viewMode === 'grid' ? 'truncate w-full' : ''}`}>
                            {item.name}
                          </p>
                          <div className={`text-xs text-gray-500 ${viewMode === 'grid' ? 'mt-1' : 'flex items-center space-x-4'}`}>
                            {!isFolder && (
                              <>
                                <span>{formatFileSize(item.size)}</span>
                                <span>{new Date(item.modified_time).toLocaleDateString()}</span>
                              </>
                            )}
                            {isFolder && item.file_count && (
                              <span>{item.file_count} items</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className={viewMode === 'grid' ? 'flex space-x-1 mt-2' : 'flex items-center space-x-2'}>
                        {!isFolder && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDownloadFile(item)
                            }}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  )
                })}

                {filesData.length === 0 && (
                  <div className={`col-span-full text-center py-12 text-gray-500`}>
                    <FolderOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No files found</h3>
                    <p className="text-gray-500 mb-4">Upload files or create folders to get started</p>
                    <div className="flex justify-center space-x-3">
                      <Button
                        variant="primary"
                        onClick={() => setShowUploadModal(true)}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Files
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setShowCreateFolderModal(true)}
                      >
                        <FolderPlus className="w-4 h-4 mr-2" />
                        Create Folder
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <Card title="Backup Configuration">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Automatic Backups</p>
                      <p className="text-xs text-gray-500">Create backups automatically on schedule</p>
                    </div>
                    <Badge variant={project.google_drive?.auto_backup ? 'success' : 'warning'}>
                      {project.google_drive?.auto_backup ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Backup Schedule</p>
                      <p className="text-xs text-gray-500">How often to create automatic backups</p>
                    </div>
                    <Badge variant="info">{project.google_drive?.backup_schedule || 'Daily'}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Backup Folder</p>
                      <p className="text-xs text-gray-500">Google Drive folder for backups</p>
                    </div>
                    <a href={project.google_drive?.backup_folder_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                      View Folder
                    </a>
                  </div>
                </div>
              </Card>

              <Card title="Cleanup Options">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Manage backup retention and cleanup policies.</p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => handleCleanup(7)}
                      disabled={cleanupBackups.isLoading}
                    >
                      Delete 7+ days old
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleCleanup(30)}
                      disabled={cleanupBackups.isLoading}
                    >
                      Delete 30+ days old
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleCleanup(90)}
                      disabled={cleanupBackups.isLoading}
                    >
                      Delete 90+ days old
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Upload Files Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Upload Files</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Files
                </label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setUploadFiles(e.target.files)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can select multiple files to upload at once
                </p>
              </div>

              {uploadFiles && uploadFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Files to upload:</p>
                  {Array.from(uploadFiles).map((file, index) => (
                    <div key={index} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                      <span className="truncate">{file.name}</span>
                      <span className="text-gray-500">{formatFileSize(file.size)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex space-x-3">
                <Button
                  variant="primary"
                  onClick={handleFileUpload}
                  disabled={!uploadFiles || uploadFiles.length === 0 || uploadFile.isLoading}
                >
                  {uploadFile.isLoading ? 'Uploading...' : 'Upload Files'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowUploadModal(false)
                    setUploadFiles(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Folder</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Enter folder name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>

              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Location:</strong> {currentFolderPath.length > 0
                    ? currentFolderPath.map(f => f.name).join(' / ')
                    : 'Root Folder'
                  }
                </p>
              </div>

              <div className="flex space-x-3">
                <Button
                  variant="primary"
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim() || createFolder.isLoading}
                >
                  {createFolder.isLoading ? 'Creating...' : 'Create Folder'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCreateFolderModal(false)
                    setNewFolderName('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GoogleDriveBackup