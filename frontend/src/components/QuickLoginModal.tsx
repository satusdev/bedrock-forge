/**
 * Quick Login Modal Component
 * 
 * Generates quick login URLs for WordPress admin access using
 * multiple methods (auto, redirect, manual).
 */
import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  LogIn,
  X,
  Copy,
  ExternalLink,
  Zap,
  Shield,
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react'
import Button from './ui/Button'
import Badge from './ui/Badge'
import api from '../services/api'
import toast from 'react-hot-toast'

interface QuickLoginModalProps {
  isOpen: boolean
  onClose: () => void
  projectServerId: number
  credentialId: number
  credentialLabel: string
  serverName: string
  environment: string
}

type LoginMethod = 'auto' | 'redirect' | 'manual'

interface QuickLoginResponse {
  method: string
  login_url?: string
  username?: string
  password?: string
  token?: string
  expires_at?: string
  instructions: string
}

const QuickLoginModal: React.FC<QuickLoginModalProps> = ({
  isOpen,
  onClose,
  projectServerId,
  credentialId,
  credentialLabel,
  serverName,
  environment
}) => {
  const [selectedMethod, setSelectedMethod] = useState<LoginMethod>('redirect')
  const [duration, setDuration] = useState(5)
  const [loginData, setLoginData] = useState<QuickLoginResponse | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Generate quick login mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(
        `/credentials/${projectServerId}/credentials/${credentialId}/quick-login`,
        {
          method: selectedMethod,
          duration_minutes: duration
        }
      )
      return response.data
    },
    onSuccess: (data: QuickLoginResponse) => {
      setLoginData(data)
      toast.success('Login URL generated')
    },
    onError: (error: any) => {
      toast.error(`Failed to generate: ${error.message}`)
    }
  })

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleOpenLogin = () => {
    if (loginData?.login_url) {
      window.open(loginData.login_url, '_blank')
    }
  }

  const resetModal = () => {
    setLoginData(null)
    setSelectedMethod('redirect')
    setDuration(5)
  }

  const handleClose = () => {
    resetModal()
    onClose()
  }

  if (!isOpen) return null

  const methods: { id: LoginMethod; name: string; description: string; security: string }[] = [
    {
      id: 'auto',
      name: 'Auto Login',
      description: 'One-click login via MU-plugin (requires plugin installation)',
      security: 'High'
    },
    {
      id: 'redirect',
      name: 'Form Redirect',
      description: 'Auto-submits login form in new tab',
      security: 'Medium'
    },
    {
      id: 'manual',
      name: 'Show Credentials',
      description: 'Display credentials for manual copy-paste',
      security: 'Basic'
    }
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center">
            <LogIn className="w-5 h-5 mr-2 text-primary-500" />
            <h2 className="text-lg font-semibold">Quick Login</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Server Info */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
            <div>
              <div className="font-medium">{credentialLabel}</div>
              <div className="text-sm text-gray-500">{serverName}</div>
            </div>
            <Badge
              variant={
                environment === 'production' ? 'danger' :
                environment === 'staging' ? 'warning' : 'info'
              }
            >
              {environment}
            </Badge>
          </div>

          {!loginData ? (
            <>
              {/* Method Selection */}
              <div className="space-y-3 mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Login Method
                </label>
                {methods.map(method => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setSelectedMethod(method.id)}
                    className={`w-full flex items-start p-3 rounded-lg border text-left transition-colors ${
                      selectedMethod === method.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{method.name}</span>
                        <Badge
                          variant={
                            method.security === 'High' ? 'success' :
                            method.security === 'Medium' ? 'warning' : 'default'
                          }
                          className="text-xs"
                        >
                          {method.security}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {method.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Duration */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token Duration
                </label>
                <select
                  value={duration}
                  onChange={e => setDuration(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value={1}>1 minute</option>
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>

              {/* Warning for production */}
              {environment === 'production' && (
                <div className="flex items-start p-3 bg-red-50 border border-red-100 rounded-lg mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" />
                  <p className="text-sm text-red-700">
                    You are logging into a <strong>production</strong> environment.
                    Be careful with any changes you make.
                  </p>
                </div>
              )}

              {/* Generate Button */}
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="w-full"
              >
                {generateMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Generate Login URL
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Login Result */}
              <div className="space-y-4">
                <div className="flex items-center text-green-600 mb-2">
                  <CheckCircle className="w-5 h-5 mr-2" />
                  <span className="font-medium">Login URL Ready</span>
                </div>

                {loginData.login_url && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Login URL
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        value={loginData.login_url}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCopy(loginData.login_url!, 'url')}
                      >
                        {copiedField === 'url' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {loginData.username && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        value={loginData.username}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCopy(loginData.username!, 'username')}
                      >
                        {copiedField === 'username' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {loginData.password && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        readOnly
                        value={loginData.password}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCopy(loginData.password!, 'password')}
                      >
                        {copiedField === 'password' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {loginData.expires_at && (
                  <p className="text-xs text-gray-500">
                    Expires: {new Date(loginData.expires_at).toLocaleString()}
                  </p>
                )}

                <p className="text-sm text-gray-600 p-3 bg-gray-50 rounded-lg">
                  {loginData.instructions}
                </p>

                <div className="flex space-x-3 pt-2">
                  <Button
                    variant="secondary"
                    onClick={resetModal}
                    className="flex-1"
                  >
                    Generate New
                  </Button>
                  {loginData.login_url && (
                    <Button
                      onClick={handleOpenLogin}
                      className="flex-1"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open Login
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuickLoginModal
