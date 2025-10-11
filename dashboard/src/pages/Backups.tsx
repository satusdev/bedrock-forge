import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Cloud,
  Download,
  Upload,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Play,
  Settings,
  Filter,
  Search,
  ChevronDown,
  HardDrive,
  FileText
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { dashboardApi } from '@/services/api'
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates'
import toast from 'react-hot-toast'

interface BackupInfo {
  path: string
  info: {
    timestamp: string
    type: string
    database: boolean
    files: boolean
    size: number
  }
}

const Backups: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'project'>('date')

  const queryClient = useQueryClient()

  // Set up real-time updates
  const { isConnected } = useRealTimeUpdates({
    onWordPressUpdate: (projectName, data) => {
      // Refresh backups when backup operations complete
      if (data.type?.includes('backup')) {
        queryClient.invalidateQueries(['backups', selectedProject])
      }
    }
  })

  // Fetch projects for dropdown
  const { data: projectsData } = useQuery({
    queryKey: ['comprehensive-projects'],
    queryFn: dashboardApi.getComprehensiveProjects,
  })

  const projects = projectsData?.data || []

  // Fetch backups for selected project
  const { data: backupsData, isLoading, refetch } = useQuery({
    queryKey: ['backups', selectedProject],
    queryFn: () => selectedProject ? dashboardApi.listBackups(selectedProject) : null,
    enabled: !!selectedProject,
  })

  const backups = backupsData?.data?.backups || []

  // Create backup mutation
  const createBackupMutation = useMutation({
    mutationFn: (backupOptions: any) => dashboardApi.createBackup(selectedProject, backupOptions),
    onSuccess: (response) => {
      toast.success('Backup started successfully!')
      setShowBackupModal(false)
      refetch()
    },
    onError: (error: any) => {
      toast.error(`Failed to start backup: ${error.message}`)
    }
  })

  // Restore backup mutation
  const restoreBackupMutation = useMutation({
    mutationFn: (restoreOptions: any) => dashboardApi.restoreBackup(selectedProject, restoreOptions),
    onSuccess: (response) => {
      toast.success('Restore started successfully!')
      setShowRestoreModal(false)
      setSelectedBackup(null)
    },
    onError: (error: any) => {
      toast.error(`Failed to start restore: ${error.message}`)
    }
  })

  // Filter and sort backups
  const filteredBackups = backups
    .filter(backup => {
      if (!searchQuery) return true
      const searchLower = searchQuery.toLowerCase()
      return backup.info.timestamp.toLowerCase().includes(searchLower) ||
             backup.info.type.toLowerCase().includes(searchLower)
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.info.timestamp).getTime() - new Date(a.info.timestamp).getTime()
        case 'size':
          return b.info.size - a.info.size
        case 'project':
          return 0 // No project sorting in individual view
        default:
          return 0
      }
    })

  const handleCreateBackup = (backupOptions: any) => {
    if (!selectedProject) {
      toast.error('Please select a project first')
      return
    }
    createBackupMutation.mutate(backupOptions)
  }

  const handleRestoreBackup = (restoreOptions: any) => {
    if (!selectedBackup || !selectedProject) {
      toast.error('Please select a backup and project')
      return
    }
    restoreBackupMutation.mutate({
      backup_path: selectedBackup.path,
      ...restoreOptions
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  const getBackupTypeBadge = (type: string) => {
    switch (type) {
      case 'full':
        return { variant: 'success' as const, text: 'Full' }
      case 'database':
        return { variant: 'info' as const, text: 'Database' }
      case 'files':
        return { variant: 'warning' as const, text: 'Files' }
      default:
        return { variant: 'default' as const, text: type }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backups</h1>
          <p className="mt-1 text-sm text-gray-500">Manage project backups and restore points</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Connection Status */}
          <div className="flex items-center space-x-2 px-3 py-1 rounded-lg bg-gray-100">
            {isConnected ? (
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            ) : (
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            )}
            <span className="text-sm text-gray-700">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <Button
            variant="primary"
            onClick={() => setShowBackupModal(true)}
            disabled={!selectedProject}
          >
            <Database className="w-4 h-4 mr-2" />
            Create Backup
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Project Selection */}
        <div className="lg:col-span-1">
          <Card title="Select Project">
            <div className="space-y-2">
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Choose a project...</option>
                {projects.map((project: any) => (
                  <option key={project.project_name} value={project.project_name}>
                    {project.project_name}
                  </option>
                ))}
              </select>

              {selectedProject && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total Backups</span>
                    <span className="font-medium">{backups.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Storage Used</span>
                    <span className="font-medium">
                      {formatFileSize(backups.reduce((total, backup) => total + backup.info.size, 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Last Backup</span>
                    <span className="font-medium">
                      {backups.length > 0
                        ? formatDate(backups[0].info.timestamp)
                        : 'Never'
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Backup List */}
        <div className="lg:col-span-3">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search backups..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'size' | 'project')}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="date">Sort by Date</option>
                  <option value="size">Sort by Size</option>
                </select>
              </div>
              <Button
                variant="secondary"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {!selectedProject ? (
              <div className="text-center py-12">
                <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Project Selected</h3>
                <p className="text-gray-500 mb-4">Select a project to view and manage backups</p>
              </div>
            ) : isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                <p className="mt-3 text-gray-500">Loading backups...</p>
              </div>
            ) : filteredBackups.length === 0 ? (
              <div className="text-center py-12">
                <Cloud className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Backups Found</h3>
                <p className="text-gray-500 mb-4">Create your first backup for this project</p>
                <Button onClick={() => setShowBackupModal(true)}>
                  <Database className="w-4 h-4 mr-2" />
                  Create First Backup
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBackups.map((backup, index) => {
                  const typeBadge = getBackupTypeBadge(backup.info.type)
                  return (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                            <Database className="w-5 h-5 text-primary-600" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="font-medium text-gray-900">
                                Backup from {formatDate(backup.info.timestamp)}
                              </h4>
                              <Badge variant={typeBadge.variant}>
                                {typeBadge.text}
                              </Badge>
                            </div>
                            <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                              <span className="flex items-center">
                                <HardDrive className="w-4 h-4 mr-1" />
                                {formatFileSize(backup.info.size)}
                              </span>
                              <span className="flex items-center">
                                <Clock className="w-4 h-4 mr-1" />
                                {new Date(backup.info.timestamp).toLocaleDateString()}
                              </span>
                              <span className="flex items-center">
                                <Database className="w-4 h-4 mr-1" />
                                {backup.info.database ? 'DB' : 'No DB'}
                              </span>
                              <span className="flex items-center">
                                <FileText className="w-4 h-4 mr-1" />
                                {backup.info.files ? 'Files' : 'No Files'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedBackup(backup)
                              setShowRestoreModal(true)
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Backup Creation Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Create Backup</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Backup Type
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="full">Full Backup (Database + Files)</option>
                  <option value="database">Database Only</option>
                  <option value="files">Files Only</option>
                </select>
              </div>
              <div className="flex items-center space-x-3">
                <input type="checkbox" id="include-db" defaultChecked className="rounded border-gray-300" />
                <label htmlFor="include-db" className="text-sm text-gray-700">
                  Include Database
                </label>
              </div>
              <div className="flex items-center space-x-3">
                <input type="checkbox" id="include-files" defaultChecked className="rounded border-gray-300" />
                <label htmlFor="include-files" className="text-sm text-gray-700">
                  Include Files (wp-content)
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="secondary" onClick={() => setShowBackupModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => handleCreateBackup({
                  type: 'full',
                  database: true,
                  files: true
                })}
                disabled={createBackupMutation.isLoading}
              >
                {createBackupMutation.isLoading ? 'Creating...' : 'Create Backup'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Modal */}
      {showRestoreModal && selectedBackup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Restore Backup</h3>
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-2" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800">Warning</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      This will replace the current database and/or files with the backup from {formatDate(selectedBackup.info.timestamp)}.
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  <strong>Backup:</strong> {formatDate(selectedBackup.info.timestamp)}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Type:</strong> {selectedBackup.info.type}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Size:</strong> {formatFileSize(selectedBackup.info.size)}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <input type="checkbox" id="restore-db" defaultChecked className="rounded border-gray-300" />
                  <label htmlFor="restore-db" className="text-sm text-gray-700">
                    Restore Database
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input type="checkbox" id="restore-files" defaultChecked className="rounded border-gray-300" />
                  <label htmlFor="restore-files" className="text-sm text-gray-700">
                    Restore Files (wp-content)
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="secondary" onClick={() => setShowRestoreModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleRestoreBackup({
                  type: 'full',
                  database: true,
                  files: true
                })}
                disabled={restoreBackupMutation.isLoading}
              >
                {restoreBackupMutation.isLoading ? 'Restoring...' : 'Restore Backup'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Backups