/**
 * Monitoring Page
 * Uptime monitoring dashboard with status indicators.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Pause,
  Play,
  Trash2,
  Edit3,
  Clock,
  Globe
} from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import api from '../services/api'
import toast from 'react-hot-toast'

interface Monitor {
  id: number
  name: string
  url: string
  monitor_type: string
  is_active: boolean
  last_check_at: string | null
  last_status: string | null
  last_response_time_ms: number | null
  uptime_percentage: number | null
  interval_seconds: number
}

interface CreateMonitorForm {
  name: string
  url: string
  monitor_type: string
  interval_seconds: number
  timeout_seconds: number
}

export default function Monitoring() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState<CreateMonitorForm>({
    name: '',
    url: '',
    monitor_type: 'uptime',
    interval_seconds: 300,
    timeout_seconds: 30,
  })
  const queryClient = useQueryClient()

  // Fetch monitors
  const { data: monitorsData, isLoading } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => api.get<Monitor[]>('/monitors'),
  })

  const monitors = monitorsData?.data || []

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateMonitorForm) => api.post('/monitors', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] })
      setShowCreateModal(false)
      setFormData({ name: '', url: '', monitor_type: 'uptime', interval_seconds: 300, timeout_seconds: 30 })
      toast.success('Monitor created')
    },
    onError: () => toast.error('Failed to create monitor'),
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/monitors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] })
      toast.success('Monitor deleted')
    },
    onError: () => toast.error('Failed to delete monitor'),
  })

  // Toggle pause mutation
  const pauseMutation = useMutation({
    mutationFn: (id: number) => api.post(`/monitors/${id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monitors'] })
    },
    onError: () => toast.error('Failed to toggle monitor'),
  })

  const filteredMonitors = monitors.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.url.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusIcon = (status: string | null, isActive: boolean) => {
    if (!isActive) return <Pause className="w-5 h-5 text-gray-400" />
    if (status === 'up') return <CheckCircle className="w-5 h-5 text-green-500" />
    if (status === 'down') return <XCircle className="w-5 h-5 text-red-500" />
    return <AlertTriangle className="w-5 h-5 text-yellow-500" />
  }

  const getUptimeColor = (uptime: number | null) => {
    if (!uptime) return 'text-gray-500'
    if (uptime >= 99.9) return 'text-green-600'
    if (uptime >= 99) return 'text-yellow-600'
    return 'text-red-600'
  }

  // Stats
  const upCount = monitors.filter(m => m.is_active && m.last_status === 'up').length
  const downCount = monitors.filter(m => m.is_active && m.last_status === 'down').length
  const pausedCount = monitors.filter(m => !m.is_active).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoring</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track uptime and performance ({monitors.length} monitors)
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Monitor
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Up</p>
              <p className="text-lg font-semibold text-gray-900">{upCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Down</p>
              <p className="text-lg font-semibold text-gray-900">{downCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Pause className="w-5 h-5 text-gray-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Paused</p>
              <p className="text-lg font-semibold text-gray-900">{pausedCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search monitors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </Card>

      {/* Monitors List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filteredMonitors.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900">No Monitors Found</h3>
            <p className="mt-2 text-gray-500">Add a monitor to start tracking uptime.</p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Response</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Checked</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uptime</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMonitors.map(monitor => (
                  <tr key={monitor.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      {getStatusIcon(monitor.last_status, monitor.is_active)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{monitor.name}</div>
                      <div className="text-sm text-gray-500 capitalize">{monitor.monitor_type}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {monitor.url}
                    </td>
                    <td className="px-6 py-4">
                      {monitor.last_response_time_ms ? (
                        <span className="text-sm">{monitor.last_response_time_ms}ms</span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                        {monitor.last_check_at ? (
                            new Date(monitor.last_check_at).toLocaleString()
                        ) : (
                            <span className="text-gray-400">-</span>
                        )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-medium ${getUptimeColor(monitor.uptime_percentage)}`}>
                        {monitor.uptime_percentage ? `${monitor.uptime_percentage.toFixed(2)}%` : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => pauseMutation.mutate(monitor.id)}
                          title={monitor.is_active ? 'Pause' : 'Resume'}
                        >
                          {monitor.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Delete this monitor?')) {
                              deleteMutation.mutate(monitor.id)
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Monitor</h2>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData) }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check Interval</label>
                <select
                  value={formData.interval_seconds}
                  onChange={(e) => setFormData({ ...formData, interval_seconds: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={60}>1 minute</option>
                  <option value={300}>5 minutes</option>
                  <option value={600}>10 minutes</option>
                  <option value={1800}>30 minutes</option>
                  <option value={3600}>1 hour</option>
                </select>
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Monitor'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
