/**
 * Server Link Modal Component
 * 
 * Modal for linking a server to a project with environment context.
 */
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Server,
  Globe,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  RefreshCw
} from 'lucide-react'
import Button from './ui/Button'
import Badge from './ui/Badge'
import api from '../services/api'
import toast from 'react-hot-toast'

interface ServerData {
  id: number
  name: string
  hostname: string
  status: string
  panel_type: string
}

interface ServerLinkModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  projectName: string
  existingLinks?: number[]  // Server IDs already linked
}

const ServerLinkModal: React.FC<ServerLinkModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  existingLinks = []
}) => {
  const [selectedServer, setSelectedServer] = useState<ServerData | null>(null)
  const [environment, setEnvironment] = useState<'staging' | 'production' | 'development'>('staging')
  const [wpPath, setWpPath] = useState('')
  const [wpUrl, setWpUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isPrimary, setIsPrimary] = useState(true)
  const [showDirectories, setShowDirectories] = useState(false)
  const [directories, setDirectories] = useState<string[]>([])

  const queryClient = useQueryClient()

  // Fetch user's servers
  const { data: serversData, isLoading: serversLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
    enabled: isOpen
  })

  const servers = serversData?.data || []
  const availableServers = servers.filter(
    (s: ServerData) => !existingLinks.includes(s.id)
  )

  // Scan directories mutation
  const scanMutation = useMutation({
    mutationFn: async (serverId: number) => {
      return api.post(`/servers/${serverId}/scan-directories?base_path=/var/www&max_depth=3`)
    },
    onSuccess: (data) => {
      const dirs = data.data?.directories || []
      setDirectories(dirs.map((d: any) => d.path))
      setShowDirectories(true)
      if (dirs.length > 0) {
        toast.success(`Found ${dirs.length} WordPress installation(s)`)
      } else {
        toast('No WordPress installations found')
      }
    },
    onError: (error: any) => {
      toast.error(`Scan failed: ${error.message}`)
    }
  })

  // Link server mutation
  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedServer) throw new Error('No server selected')
      return api.post(`/projects/${projectId}/servers`, {
        server_id: selectedServer.id,
        environment,
        wp_path: wpPath,
        wp_url: wpUrl,
        notes: notes || null,
        is_primary: isPrimary
      })
    },
    onSuccess: () => {
      toast.success('Server linked successfully')
      queryClient.invalidateQueries({ queryKey: ['project', projectName] })
      queryClient.invalidateQueries({ queryKey: ['project-servers', projectId] })
      onClose()
    },
    onError: (error: any) => {
      toast.error(`Failed to link server: ${error.message}`)
    }
  })

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedServer(null)
      setEnvironment('staging')
      setWpPath('')
      setWpUrl('')
      setNotes('')
      setIsPrimary(true)
      setShowDirectories(false)
      setDirectories([])
    }
  }, [isOpen])

  // Auto-populate URL based on environment
  useEffect(() => {
    if (selectedServer && environment && !wpUrl) {
      const prefix = environment === 'production' ? 'www' : environment
      setWpUrl(`https://${prefix}.example.com`)
    }
  }, [selectedServer, environment])

  const handleScanDirectories = () => {
    if (selectedServer) {
      scanMutation.mutate(selectedServer.id)
    }
  }

  const handleSelectDirectory = (dir: string) => {
    setWpPath(dir)
    setShowDirectories(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedServer) {
      toast.error('Please select a server')
      return
    }
    if (!wpPath) {
      toast.error('Please enter the WordPress path')
      return
    }
    if (!wpUrl) {
      toast.error('Please enter the WordPress URL')
      return
    }

    linkMutation.mutate()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Link Server to {projectName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Server Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Server
            </label>
            {serversLoading ? (
              <div className="text-center py-4">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-gray-400" />
              </div>
            ) : availableServers.length === 0 ? (
              <div className="text-center py-4 bg-gray-50 rounded-lg">
                <Server className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">
                  {servers.length === 0 
                    ? 'No servers available. Add a server first.' 
                    : 'All servers are already linked to this project.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableServers.map((server: ServerData) => (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => setSelectedServer(server)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      selectedServer?.id === server.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <Server className="w-5 h-5 mr-3 text-gray-400" />
                      <div className="text-left">
                        <div className="font-medium">{server.name}</div>
                        <div className="text-xs text-gray-500">{server.hostname}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={server.status === 'online' ? 'success' : 'warning'}>
                        {server.status}
                      </Badge>
                      {selectedServer?.id === server.id && (
                        <CheckCircle className="w-5 h-5 text-primary-500" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Environment */}
          {selectedServer && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Environment
              </label>
              <div className="flex space-x-2">
                {(['development', 'staging', 'production'] as const).map(env => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setEnvironment(env)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium capitalize ${
                      environment === env
                        ? env === 'production'
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : env === 'staging'
                            ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                            : 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {env}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* WordPress Path */}
          {selectedServer && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                WordPress Path
              </label>
              <div className="flex space-x-2">
                <div className="flex-1 relative">
                  <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={wpPath}
                    onChange={e => setWpPath(e.target.value)}
                    placeholder="/var/www/mysite/public_html"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleScanDirectories}
                  disabled={scanMutation.isPending}
                >
                  {scanMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Scan'
                  )}
                </Button>
              </div>
              
              {/* Directory suggestions */}
              {showDirectories && directories.length > 0 && (
                <div className="mt-2 border rounded-lg divide-y max-h-40 overflow-y-auto">
                  {directories.map((dir, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectDirectory(dir)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center"
                    >
                      <FolderOpen className="w-4 h-4 mr-2 text-gray-400" />
                      {dir}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WordPress URL */}
          {selectedServer && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                WordPress URL
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="url"
                  value={wpUrl}
                  onChange={e => setWpUrl(e.target.value)}
                  placeholder="https://staging.example.com"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          {selectedServer && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any additional notes about this server link..."
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Primary Toggle */}
          {selectedServer && (
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={e => setIsPrimary(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                Set as primary server for this environment
              </span>
            </label>
          )}

          {/* Warning for production */}
          {environment === 'production' && (
            <div className="flex items-start p-3 bg-red-50 border border-red-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
              <p className="text-sm text-red-700">
                <strong>Production environment:</strong> Be extra careful when syncing 
                to this server. Data pushes will overwrite production data.
              </p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedServer || !wpPath || !wpUrl || linkMutation.isPending}
          >
            {linkMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Linking...
              </>
            ) : (
              <>
                <Server className="w-4 h-4 mr-2" />
                Link Server
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ServerLinkModal
