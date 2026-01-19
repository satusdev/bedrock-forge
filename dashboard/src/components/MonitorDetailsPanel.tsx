/**
 * Monitor Details Panel Component
 * 
 * Displays detailed monitor information, history, and SSL status.
 */
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  Bell,
  Pause,
  Play,
  TrendingUp,
  ExternalLink
} from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import Badge from './ui/Badge'
import api from '../services/api'
import toast from 'react-hot-toast'

interface Monitor {
  id: number
  name: string
  url: string
  monitor_type: string
  interval_seconds: number
  timeout_seconds: number
  is_active: boolean
  last_check_at?: string
  last_status?: string
  last_response_time_ms?: number
  uptime_percentage?: number
}

interface SSLInfo {
  valid: boolean
  issuer?: string
  expires_at?: string
  days_until_expiry?: number
  error?: string
  warning?: boolean
}

interface MonitorDetailsPanelProps {
  monitor: Monitor
  onClose?: () => void
}

const MonitorDetailsPanel: React.FC<MonitorDetailsPanelProps> = ({
  monitor,
  onClose
}) => {
  const [showAlertConfig, setShowAlertConfig] = useState(false)
  const queryClient = useQueryClient()

  // Fetch SSL info
  const { data: sslData, isLoading: sslLoading } = useQuery({
    queryKey: ['monitor-ssl', monitor.id],
    queryFn: () => api.get(`/monitors/${monitor.id}/ssl`),
    enabled: monitor.url.startsWith('https://')
  })

  const sslInfo: SSLInfo | undefined = sslData?.data

  // Fetch history
  const { data: historyData } = useQuery({
    queryKey: ['monitor-history', monitor.id],
    queryFn: () => api.get(`/monitors/${monitor.id}/history?hours=24`)
  })

  // Check now mutation
  const checkMutation = useMutation({
    mutationFn: () => api.post(`/monitors/${monitor.id}/check`),
    onSuccess: () => {
      toast.success('Check triggered')
      queryClient.invalidateQueries({ queryKey: ['monitors'] })
    },
    onError: (error: any) => {
      toast.error(`Check failed: ${error.message}`)
    }
  })

  // Pause/resume mutation
  const toggleMutation = useMutation({
    mutationFn: () => api.post(`/monitors/${monitor.id}/pause`),
    onSuccess: (data: any) => {
      toast.success(data.data.message)
      queryClient.invalidateQueries({ queryKey: ['monitors'] })
    },
    onError: (error: any) => {
      toast.error(`Toggle failed: ${error.message}`)
    }
  })

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'up': return 'text-green-500'
      case 'down': return 'text-red-500'
      default: return 'text-gray-400'
    }
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'up':
        return <Badge variant="success"><CheckCircle className="w-3 h-3 mr-1" />Up</Badge>
      case 'down':
        return <Badge variant="danger"><XCircle className="w-3 h-3 mr-1" />Down</Badge>
      default:
        return <Badge><Clock className="w-3 h-3 mr-1" />Unknown</Badge>
    }
  }

  const formatUptime = (uptime?: number) => {
    if (uptime === undefined || uptime === null) return '-'
    return `${uptime.toFixed(2)}%`
  }

  return (
    <Card title={monitor.name}>
      <div className="space-y-6">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-full ${
              monitor.last_status === 'up' ? 'bg-green-100' :
              monitor.last_status === 'down' ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              <Activity className={`w-6 h-6 ${getStatusColor(monitor.last_status)}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                {getStatusBadge(monitor.last_status)}
                {!monitor.is_active && (
                  <Badge variant="warning">Paused</Badge>
                )}
              </div>
              <a
                href={monitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 hover:text-primary-500 flex items-center mt-1"
              >
                {monitor.url}
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
            >
              {monitor.is_active ? (
                <><Pause className="w-4 h-4 mr-1" />Pause</>
              ) : (
                <><Play className="w-4 h-4 mr-1" />Resume</>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => checkMutation.mutate()}
              disabled={checkMutation.isPending}
            >
              {checkMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Check Now
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-2 text-green-500" />
            <div className="text-2xl font-bold">{formatUptime(monitor.uptime_percentage)}</div>
            <div className="text-xs text-gray-500">Uptime</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg text-center">
            <Clock className="w-5 h-5 mx-auto mb-2 text-blue-500" />
            <div className="text-2xl font-bold">
              {monitor.last_response_time_ms ? `${monitor.last_response_time_ms}ms` : '-'}
            </div>
            <div className="text-xs text-gray-500">Response Time</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg text-center">
            <Activity className="w-5 h-5 mx-auto mb-2 text-purple-500" />
            <div className="text-2xl font-bold">{monitor.interval_seconds}s</div>
            <div className="text-xs text-gray-500">Check Interval</div>
          </div>
        </div>

        {/* SSL Certificate */}
        {monitor.url.startsWith('https://') && (
          <div className="p-4 border rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Shield className="w-5 h-5 mr-2 text-gray-500" />
                <span className="font-medium">SSL Certificate</span>
              </div>
              {sslLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
              ) : sslInfo?.valid ? (
                <Badge variant={sslInfo.warning ? 'warning' : 'success'}>
                  {sslInfo.days_until_expiry} days left
                </Badge>
              ) : (
                <Badge variant="danger">Invalid</Badge>
              )}
            </div>
            {sslInfo && (
              <div className="text-sm text-gray-500 space-y-1">
                {sslInfo.issuer && <p>Issuer: {sslInfo.issuer}</p>}
                {sslInfo.expires_at && (
                  <p>Expires: {new Date(sslInfo.expires_at).toLocaleDateString()}</p>
                )}
                {sslInfo.error && (
                  <p className="text-red-500">{sslInfo.error}</p>
                )}
                {sslInfo.warning && (
                  <div className="flex items-center text-yellow-600 mt-2">
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Certificate expiring soon!
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* History Summary */}
        {historyData?.data && (
          <div className="p-4 border rounded-lg">
            <div className="flex items-center mb-3">
              <Clock className="w-5 h-5 mr-2 text-gray-500" />
              <span className="font-medium">Last 24 Hours</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Uptime:</span>
                <span className="ml-2 font-medium">
                  {historyData.data.uptime_percentage?.toFixed(2)}%
                </span>
              </div>
              <div>
                <span className="text-gray-500">Avg Response:</span>
                <span className="ml-2 font-medium">
                  {historyData.data.avg_response_time_ms || '-'}ms
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Alert Configuration */}
        <div className="p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Bell className="w-5 h-5 mr-2 text-gray-500" />
              <span className="font-medium">Alerts</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAlertConfig(!showAlertConfig)}
            >
              Configure
            </Button>
          </div>
          {showAlertConfig && (
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex items-center space-x-2">
                <input type="checkbox" defaultChecked className="rounded" />
                <span>Alert on downtime</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" defaultChecked className="rounded" />
                <span>Alert on SSL expiry (14 days)</span>
              </label>
              <label className="flex items-center space-x-2">
                <input type="checkbox" className="rounded" />
                <span>Alert on slow response ({">"} 5s)</span>
              </label>
            </div>
          )}
        </div>

        {/* Last Check */}
        {monitor.last_check_at && (
          <div className="text-xs text-gray-400 text-center">
            Last checked: {new Date(monitor.last_check_at).toLocaleString()}
          </div>
        )}
      </div>
    </Card>
  )
}

export default MonitorDetailsPanel
