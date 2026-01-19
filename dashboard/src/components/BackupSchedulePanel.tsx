/**
 * Backup Schedule Panel Component
 * 
 * Manages backup scheduling and displays backup history for a project.
 */
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  Calendar,
  Clock,
  Download,
  Trash2,
  RefreshCw,
  Play,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HardDrive,
} from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import Badge from './ui/Badge'
import api from '../services/api'
import toast from 'react-hot-toast'

interface Backup {
  id: number
  project_id: number
  backup_type: string
  storage_type: string
  status: string
  file_path?: string
  size_bytes?: number
  notes?: string
  created_at: string
  completed_at?: string
}

interface BackupSchedule {
  type: string
  retention_days: number
  backup_type: string
  enabled: boolean
  next_run?: string
}

interface BackupSchedulePanelProps {
  projectId: number
  projectName: string
}

const BackupSchedulePanel: React.FC<BackupSchedulePanelProps> = ({
  projectId,
  projectName
}) => {
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleConfig, setScheduleConfig] = useState<BackupSchedule>({
    type: 'daily',
    retention_days: 30,
    backup_type: 'full',
    enabled: false
  })

  const queryClient = useQueryClient()

  // Fetch backups
  const { data: backupsData, isLoading } = useQuery({
    queryKey: ['backups', projectId],
    queryFn: () => api.get(`/backups?project_id=${projectId}`),
    enabled: !!projectId
  })

  const backups: Backup[] = backupsData?.data || []

  // Fetch schedule
  const { data: scheduleData } = useQuery({
    queryKey: ['backup-schedule', projectId],
    queryFn: () => api.get(`/backups/schedule/${projectId}`),
    enabled: !!projectId
  })

  // Create backup mutation
  const createMutation = useMutation({
    mutationFn: (backupType: string) => api.post('/backups', {
      project_id: projectId,
      backup_type: backupType
    }),
    onSuccess: () => {
      toast.success('Backup started')
      queryClient.invalidateQueries({ queryKey: ['backups', projectId] })
    },
    onError: (error: any) => {
      toast.error(`Backup failed: ${error.message}`)
    }
  })

  // Delete backup mutation
  const deleteMutation = useMutation({
    mutationFn: (backupId: number) => api.delete(`/backups/${backupId}`),
    onSuccess: () => {
      toast.success('Backup deleted')
      queryClient.invalidateQueries({ queryKey: ['backups', projectId] })
    },
    onError: (error: any) => {
      toast.error(`Delete failed: ${error.message}`)
    }
  })

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: (backupId: number) => api.post(`/backups/${backupId}/restore`),
    onSuccess: () => {
      toast.success('Restore started')
    },
    onError: (error: any) => {
      toast.error(`Restore failed: ${error.message}`)
    }
  })

  // Save schedule mutation
  const scheduleMutation = useMutation({
    mutationFn: (config: BackupSchedule) => api.post('/backups/schedule', {
      project_id: projectId,
      ...config
    }),
    onSuccess: () => {
      toast.success('Schedule saved')
      setShowScheduleModal(false)
      queryClient.invalidateQueries({ queryKey: ['backup-schedule', projectId] })
    },
    onError: (error: any) => {
      toast.error(`Save failed: ${error.message}`)
    }
  })

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>
      case 'in_progress':
        return <Badge variant="warning"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />In Progress</Badge>
      case 'failed':
        return <Badge variant="danger"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>
      case 'pending':
        return <Badge><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const handleDelete = (backup: Backup) => {
    if (confirm(`Delete backup from ${new Date(backup.created_at).toLocaleDateString()}?`)) {
      deleteMutation.mutate(backup.id)
    }
  }

  const handleRestore = (backup: Backup) => {
    if (confirm(`Restore from this backup? This will overwrite local data.`)) {
      restoreMutation.mutate(backup.id)
    }
  }

  return (
    <>
      <Card
        title="Backups"
        actions={
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowScheduleModal(true)}
            >
              <Settings className="w-4 h-4 mr-1" />
              Schedule
            </Button>
            <Button
              size="sm"
              onClick={() => createMutation.mutate('full')}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              Backup Now
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Schedule Info */}
          {scheduleData?.data?.schedule && (
            <div className={`flex items-center justify-between p-3 rounded-lg border ${
              scheduleData.data.schedule.enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                <div>
                  <span className="font-medium">
                    {scheduleData.data.schedule.enabled ? 'Scheduled' : 'No Schedule'}
                  </span>
                  {scheduleData.data.schedule.enabled && (
                    <span className="text-sm text-gray-500 ml-2">
                      {scheduleData.data.schedule.type} • {scheduleData.data.schedule.retention_days} days retention
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowScheduleModal(true)}
              >
                Configure
              </Button>
            </div>
          )}

          {/* Backups List */}
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8">
              <Archive className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <h3 className="text-sm font-medium text-gray-900 mb-1">No Backups Yet</h3>
              <p className="text-sm text-gray-500">
                Create your first backup to protect your data.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.slice(0, 10).map(backup => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center space-x-4">
                    <HardDrive className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium capitalize">{backup.backup_type}</span>
                        {getStatusBadge(backup.status)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(backup.created_at).toLocaleString()}
                        {backup.size_bytes && ` • ${formatSize(backup.size_bytes)}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {backup.status === 'completed' && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRestore(backup)}
                          title="Restore"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(backup)}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {backups.length > 10 && (
            <p className="text-sm text-gray-500 text-center">
              Showing 10 of {backups.length} backups
            </p>
          )}
        </div>
      </Card>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md mx-4">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Backup Schedule</h2>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={scheduleConfig.enabled}
                    onChange={e => setScheduleConfig(prev => ({
                      ...prev,
                      enabled: e.target.checked
                    }))}
                    className="rounded border-gray-300"
                  />
                  <span className="font-medium">Enable Scheduled Backups</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency
                </label>
                <select
                  value={scheduleConfig.type}
                  onChange={e => setScheduleConfig(prev => ({
                    ...prev,
                    type: e.target.value
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Backup Type
                </label>
                <select
                  value={scheduleConfig.backup_type}
                  onChange={e => setScheduleConfig(prev => ({
                    ...prev,
                    backup_type: e.target.value
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="full">Full (Database + Files)</option>
                  <option value="database">Database Only</option>
                  <option value="files">Files Only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Retention (days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={scheduleConfig.retention_days}
                  onChange={e => setScheduleConfig(prev => ({
                    ...prev,
                    retention_days: parseInt(e.target.value) || 30
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50">
              <Button
                variant="secondary"
                onClick={() => setShowScheduleModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => scheduleMutation.mutate(scheduleConfig)}
                disabled={scheduleMutation.isPending}
              >
                {scheduleMutation.isPending ? 'Saving...' : 'Save Schedule'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default BackupSchedulePanel
