import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings as SettingsIcon,
  Palette,
  Bell,
  Layout,
  Database,
  Shield,
  Download,
  Upload,
  RotateCcw,
  Save
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { dashboardApi } from '@/services/api'

const Settings: React.FC = () => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('appearance')

  // Fetch dashboard configuration
  const { data: configData, isLoading } = useQuery({
    queryKey: ['dashboard-config'],
    queryFn: dashboardApi.getDashboardConfig,
  })

  const config = configData?.data

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: dashboardApi.updateDashboardConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-config'] })
    },
  })

  // Theme update mutation
  const updateThemeMutation = useMutation({
    mutationFn: dashboardApi.updateTheme,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-config'] })
    },
  })

  // Layout preferences mutation
  const updateLayoutMutation = useMutation({
    mutationFn: dashboardApi.updateLayoutPreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-config'] })
    },
  })

  // Notification preferences mutation
  const updateNotificationsMutation = useMutation({
    mutationFn: dashboardApi.updateNotificationPreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-config'] })
    },
  })

  // Reset configuration mutation
  const resetConfigMutation = useMutation({
    mutationFn: dashboardApi.resetConfiguration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-config'] })
    },
  })

  const tabs = [
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'layout', label: 'Layout', icon: Layout },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'advanced', label: 'Advanced', icon: Shield },
  ]

  const handleThemeChange = (theme: string) => {
    updateThemeMutation.mutate({ theme })
  }

  const handleColorChange = (colorType: 'primary' | 'accent', color: string) => {
    const updateData = colorType === 'primary'
      ? { theme: config?.theme || 'light', primary_color: color }
      : { theme: config?.theme || 'light', accent_color: color }
    updateThemeMutation.mutate(updateData)
  }

  const handleLayoutChange = (updates: any) => {
    updateLayoutMutation.mutate(updates)
  }

  const handleNotificationChange = (updates: any) => {
    updateNotificationsMutation.mutate(updates)
  }

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      resetConfigMutation.mutate()
    }
  }

  const handleExport = () => {
    const exportPath = `/tmp/bedrock-forge-config-${new Date().toISOString().split('T')[0]}.json`
    dashboardApi.exportConfiguration(exportPath)
      .then(() => {
        alert('Configuration exported successfully!')
      })
      .catch(() => {
        alert('Failed to export configuration')
      })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your dashboard preferences and configuration
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-3" />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </Card>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <Card title="Theme Settings">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Theme Mode
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {['light', 'dark', 'auto'].map((theme) => (
                        <button
                          key={theme}
                          onClick={() => handleThemeChange(theme)}
                          className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                            config?.theme === theme
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {theme.charAt(0).toUpperCase() + theme.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Primary Color
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={config?.primary_color || '#3b82f6'}
                        onChange={(e) => handleColorChange('primary', e.target.value)}
                        className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={config?.primary_color || '#3b82f6'}
                        onChange={(e) => handleColorChange('primary', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="#3b82f6"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Accent Color
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        value={config?.accent_color || '#10b981'}
                        onChange={(e) => handleColorChange('accent', e.target.value)}
                        className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={config?.accent_color || '#10b981'}
                        onChange={(e) => handleColorChange('accent', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="#10b981"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'layout' && (
            <div className="space-y-6">
              <Card title="Layout Preferences">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Collapse Sidebar</h4>
                      <p className="text-sm text-gray-500">Start with sidebar collapsed</p>
                    </div>
                    <button
                      onClick={() => handleLayoutChange({ sidebar_collapsed: !config?.sidebar_collapsed })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        config?.sidebar_collapsed ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config?.sidebar_collapsed ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Project View
                    </label>
                    <select
                      value={config?.default_project_view || 'grid'}
                      onChange={(e) => handleLayoutChange({ default_project_view: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="grid">Grid</option>
                      <option value="list">List</option>
                      <option value="compact">Compact</option>
                    </select>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <Card title="Notification Settings">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Enable Notifications</h4>
                      <p className="text-sm text-gray-500">Receive notifications for important events</p>
                    </div>
                    <button
                      onClick={() => handleNotificationChange({
                        notifications_enabled: !config?.notifications_enabled
                      })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        config?.notifications_enabled ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config?.notifications_enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <Card title="Advanced Settings">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">Debug Mode</h4>
                      <p className="text-sm text-gray-500">Enable debug logging and additional info</p>
                    </div>
                    <button
                      onClick={() => handleLayoutChange({ debug_mode: !config?.debug_mode })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        config?.debug_mode ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config?.debug_mode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Configuration Management</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Button
                        variant="secondary"
                        onClick={handleExport}
                        className="w-full"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Export Config
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleReset}
                        className="w-full"
                        disabled={resetConfigMutation.isLoading}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset to Defaults
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings