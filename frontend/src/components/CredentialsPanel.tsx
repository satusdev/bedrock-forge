/**
 * Credentials Panel Component
 * 
 * Manages WordPress credentials for a project-server link with
 * encryption and quick login functionality.
 */
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Key,
  Plus,
  Trash2,
  Edit3,
  LogIn,
  Eye,
  EyeOff,
  Copy,
  CheckCircle,
  RefreshCw,
  UserCircle
} from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'
import Badge from './ui/Badge'
import api from '../services/api'
import toast from 'react-hot-toast'

interface WPCredential {
  id: number
  project_server_id: number
  label: string
  username: string
  status: string
  notes?: string
  created_at?: string
}

interface CredentialsPanelProps {
  projectServerId: number
  serverName: string
  environment: string
  onQuickLogin?: (credentialId: number) => void
}

const CredentialsPanel: React.FC<CredentialsPanelProps> = ({
  projectServerId,
  serverName,
  environment,
  onQuickLogin
}) => {
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showPassword, setShowPassword] = useState<{ [key: number]: boolean }>({})
  
  const queryClient = useQueryClient()

  // Fetch credentials
  const { data: credentialsData, isLoading } = useQuery({
    queryKey: ['credentials', projectServerId],
    queryFn: () => api.get(`/credentials/${projectServerId}/credentials`),
    enabled: !!projectServerId
  })

  const credentials = credentialsData?.data || []

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (credentialId: number) => 
      api.delete(`/credentials/${projectServerId}/credentials/${credentialId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials', projectServerId] })
      toast.success('Credential deleted')
    },
    onError: (error: any) => {
      toast.error(`Failed to delete: ${error.message}`)
    }
  })

  const handleDelete = (credential: WPCredential) => {
    if (confirm(`Delete credential "${credential.label}"?`)) {
      deleteMutation.mutate(credential.id)
    }
  }

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied to clipboard`)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>
      case 'inactive':
        return <Badge variant="warning">Inactive</Badge>
      case 'expired':
        return <Badge variant="danger">Expired</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <Card title="WordPress Credentials">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card
        title="WordPress Credentials"
        actions={
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Credential
          </Button>
        }
      >
        <div className="space-y-4">
          {credentials.length === 0 ? (
            <div className="text-center py-8">
              <Key className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <h3 className="text-sm font-medium text-gray-900 mb-1">
                No Credentials Saved
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Add WordPress admin credentials for quick login access.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowAddModal(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add First Credential
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {credentials.map((credential: WPCredential) => (
                <div
                  key={credential.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <UserCircle className="w-6 h-6 text-gray-400" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{credential.label}</span>
                        {getStatusBadge(credential.status)}
                      </div>
                      <div className="flex items-center text-sm text-gray-500 mt-1">
                        <span className="font-mono">{credential.username}</span>
                        <button
                          onClick={() => handleCopy(credential.username, 'Username')}
                          className="ml-2 p-1 hover:bg-gray-200 rounded"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      {credential.notes && (
                        <p className="text-xs text-gray-400 mt-1">
                          {credential.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {onQuickLogin && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onQuickLogin(credential.id)}
                      >
                        <LogIn className="w-4 h-4 mr-1" />
                        Quick Login
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(credential.id)}
                    >
                      <Edit3 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(credential)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-gray-400 pt-4 border-t">
            Credentials are encrypted with your user-specific key and stored securely.
          </div>
        </div>
      </Card>

      {/* Add/Edit Modal */}
      {(showAddModal || editingId) && (
        <CredentialModal
          projectServerId={projectServerId}
          credentialId={editingId}
          onClose={() => {
            setShowAddModal(false)
            setEditingId(null)
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['credentials', projectServerId] })
            setShowAddModal(false)
            setEditingId(null)
          }}
        />
      )}
    </>
  )
}

// ============================================================================
// Credential Modal Component
// ============================================================================

interface CredentialModalProps {
  projectServerId: number
  credentialId: number | null
  onClose: () => void
  onSaved: () => void
}

const CredentialModal: React.FC<CredentialModalProps> = ({
  projectServerId,
  credentialId,
  onClose,
  onSaved
}) => {
  const [label, setLabel] = useState('Admin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notes, setNotes] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isEditing = !!credentialId

  // Fetch existing credential if editing
  const { data: existingData } = useQuery({
    queryKey: ['credential', projectServerId, credentialId],
    queryFn: () => api.get(`/credentials/${projectServerId}/credentials/${credentialId}`),
    enabled: !!credentialId
  })

  React.useEffect(() => {
    if (existingData?.data) {
      setLabel(existingData.data.label)
      setUsername(existingData.data.username)
      setNotes(existingData.data.notes || '')
    }
  }, [existingData])

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post(`/credentials/${projectServerId}/credentials`, data),
    onSuccess: () => {
      toast.success('Credential saved')
      onSaved()
    },
    onError: (error: any) => {
      toast.error(`Failed to save: ${error.message}`)
    }
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: any) => 
      api.put(`/credentials/${projectServerId}/credentials/${credentialId}`, data),
    onSuccess: () => {
      toast.success('Credential updated')
      onSaved()
    },
    onError: (error: any) => {
      toast.error(`Failed to update: ${error.message}`)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!username) {
      toast.error('Username is required')
      return
    }

    if (!isEditing && !password) {
      toast.error('Password is required')
      return
    }

    const data: any = { label, username, notes: notes || null }
    if (password) {
      data.password = password
    }

    if (isEditing) {
      updateMutation.mutate(data)
    } else {
      data.project_server_id = projectServerId
      data.password = password
      createMutation.mutate(data)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md mx-4">
        <form onSubmit={handleSubmit}>
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">
              {isEditing ? 'Edit Credential' : 'Add WordPress Credential'}
            </h2>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Label
              </label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g., Admin, Editor, Client"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username *
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="WordPress username"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password {!isEditing && '*'}
                {isEditing && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={isEditing ? '••••••••' : 'WordPress password'}
                  required={!isEditing}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg text-sm text-yellow-700">
              <strong>Security:</strong> Credentials are encrypted with Fernet symmetric encryption
              using a key derived from your user ID.
            </div>
          </div>

          <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 mr-2" />
                  {isEditing ? 'Update' : 'Save'} Credential
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CredentialsPanel
