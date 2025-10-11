import React, { useState } from 'react'
import {
  Globe,
  Puzzle,
  Palette,
  Shield,
  Database,
  Activity,
  CheckCircle,
  AlertTriangle,
  Search,
  RefreshCw,
  Settings,
  Eye,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Trash2,
  Edit,
  Plus,
  Calendar,
  X,
  Download,
  EyeOff
} from 'lucide-react'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Button from './ui/Button'
import { useDashboardStore } from '@/store/useDashboardStore'
import { useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '@/services/api'
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates'
import toast from 'react-hot-toast'

interface WordPressManagerProps {
  project: any
}

const WordPressManager: React.FC<WordPressManagerProps> = ({ project }) => {
  const [activeTab, setActiveTab] = useState('plugins')
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showPluginDetails, setShowPluginDetails] = useState<string | null>(null)
  const [showThemeCustomizer, setShowThemeCustomizer] = useState(false)

  const queryClient = useQueryClient()
  const { setTaskStatus } = useDashboardStore()

  // Set up real-time updates
  const { subscribeToProject } = useRealTimeUpdates({
    onWordPressUpdate: (projectName, data) => {
      if (projectName === project.project_name) {
        // Refresh plugins and themes when updates occur
        queryClient.invalidateQueries(['plugins', project.project_name])
        queryClient.invalidateQueries(['themes', project.project_name])
      }
    }
  })

  // Subscribe to real-time updates for this project
  React.useEffect(() => {
    if (project.project_name) {
      subscribeToProject(project.project_name)
    }
  }, [project.project_name, subscribeToProject])

  // Plugin update handlers
  const handleUpdatePlugin = async (pluginName: string) => {
    try {
      toast.loading(`Updating plugin ${pluginName}...`, { id: `update-plugin-${pluginName}` })
      await dashboardApi.updatePlugin(project.project_name, pluginName)
      toast.success(`Plugin ${pluginName} updated successfully!`, { id: `update-plugin-${pluginName}` })
    } catch (error: any) {
      toast.error(`Failed to update plugin: ${error.response?.data?.detail || error.message}`, {
        id: `update-plugin-${pluginName}`
      })
    }
  }

  const handleUpdateAllPlugins = async () => {
    try {
      toast.loading('Updating all plugins...', { id: 'update-all-plugins' })
      await dashboardApi.updateAllPlugins(project.project_name)
      toast.success('All plugins updated successfully!', { id: 'update-all-plugins' })
    } catch (error: any) {
      toast.error(`Failed to update plugins: ${error.response?.data?.detail || error.message}`, {
        id: 'update-all-plugins'
      })
    }
  }

  // Theme update handlers
  const handleUpdateTheme = async (themeName: string) => {
    try {
      toast.loading(`Updating theme ${themeName}...`, { id: `update-theme-${themeName}` })
      await dashboardApi.updateTheme(project.project_name, themeName)
      toast.success(`Theme ${themeName} updated successfully!`, { id: `update-theme-${themeName}` })
    } catch (error: any) {
      toast.error(`Failed to update theme: ${error.response?.data?.detail || error.message}`, {
        id: `update-theme-${themeName}`
      })
    }
  }

  const handleUpdateAllThemes = async () => {
    try {
      toast.loading('Updating all themes...', { id: 'update-all-themes' })
      await dashboardApi.updateAllThemes(project.project_name)
      toast.success('All themes updated successfully!', { id: 'update-all-themes' })
    } catch (error: any) {
      toast.error(`Failed to update themes: ${error.response?.data?.detail || error.message}`, {
        id: 'update-all-themes'
      })
    }
  }

  // WordPress core update handler
  const handleUpdateWordPressCore = async () => {
    try {
      toast.loading('Updating WordPress core...', { id: 'update-wp-core' })
      await dashboardApi.updateWordPressCore(project.project_name)
      toast.success('WordPress core updated successfully!', { id: 'update-wp-core' })
    } catch (error: any) {
      toast.error(`Failed to update WordPress core: ${error.response?.data?.detail || error.message}`, {
        id: 'update-wp-core'
      })
    }
  }

  // Get plugins
  const { data: pluginsData, isLoading: pluginsLoading } = useQuery(
    ['plugins', project.project_name],
    () => dashboardApi.getProjectPlugins(project.project_name),
    {
      enabled: !!project.project_name,
      refetchInterval: 60000, // Check every minute
    }
  )

  // Get themes
  const { data: themesData, isLoading: themesLoading } = useQuery(
    ['themes', project.project_name],
    () => dashboardApi.getProjectThemes(project.project_name),
    {
      enabled: !!project.project_name,
      refetchInterval: 60000, // Check every minute
    }
  )

  // Get WordPress info (mock - would need API endpoint)
  const { data: wpInfo } = useQuery(
    ['wordpress-info', project.project_name],
    () => Promise.resolve({
      version: '6.4.3',
      database_version: '8.0.33',
      php_version: '8.1.27',
      site_url: project.environments?.local?.url || project.environments?.production?.url,
      home_url: project.environments?.local?.url || project.environments?.production?.url,
      multisite: false,
      users_count: 3,
      posts_count: 42,
      pages_count: 8
    })
  )

  // Mock mutations for WordPress operations
  const updatePlugin = useMutation(
    (pluginName: string) => Promise.resolve({ success: true }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['plugins', project.project_name])
      },
    }
  )

  const updateTheme = useMutation(
    (themeName: string) => Promise.resolve({ success: true }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['themes', project.project_name])
      },
    }
  )

  const updateWordPressCore = useMutation(
    () => Promise.resolve({ success: true }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['wordpress-info', project.project_name])
      },
    }
  )

  const plugins = pluginsData?.data?.plugins || []
  const themes = themesData?.data?.themes || []
  const wordpressInfo = wpInfo

  const filteredPlugins = plugins.filter((plugin: any) => {
    const matchesSearch = plugin.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterStatus === 'all' || plugin.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const handlePluginAction = (pluginName: string, action: string) => {
    updatePlugin.mutate(pluginName)
  }

  const handleThemeAction = (themeName: string, action: string) => {
    updateTheme.mutate(themeName)
  }

  const handleWordPressUpdate = () => {
    updateWordPressCore.mutate()
  }

  const togglePluginSelection = (pluginName: string) => {
    setSelectedPlugins(prev =>
      prev.includes(pluginName)
        ? prev.filter(p => p !== pluginName)
        : [...prev, pluginName]
    )
  }

  const getPluginStatusColor = (status: string, update: string) => {
    if (update === 'available') return 'text-blue-600 bg-blue-100'
    if (status === 'active') return 'text-green-600 bg-green-100'
    return 'text-gray-600 bg-gray-100'
  }

  const getPluginStatusBadge = (plugin: any) => {
    if (plugin.update === 'available') return { variant: 'info' as const, text: 'Update Available' }
    if (plugin.status === 'active') return { variant: 'success' as const, text: 'Active' }
    return { variant: 'default' as const, text: 'Inactive' }
  }

  const getThemeStatusBadge = (theme: any) => {
    if (theme.status === 'active') return { variant: 'success' as const, text: 'Active' }
    return { variant: 'default' as const, text: 'Inactive' }
  }

  const tabs = [
    { id: 'plugins', name: 'Plugins', icon: Puzzle, count: plugins.length },
    { id: 'themes', name: 'Themes', icon: Palette, count: themes.length },
    { id: 'core', name: 'WordPress Core', icon: WordPress },
    { id: 'health', name: 'Site Health', icon: Shield },
    { id: 'database', name: 'Database', icon: Database },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* WordPress Overview */}
      {wordpressInfo && (
        <Card title="WordPress Information">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{wordpressInfo.version}</div>
              <p className="text-sm text-gray-500">WordPress Version</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{wordpressInfo.php_version}</div>
              <p className="text-sm text-gray-500">PHP Version</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{plugins.filter((p: any) => p.status === 'active').length}</div>
              <p className="text-sm text-gray-500">Active Plugins</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{themes.filter((t: any) => t.status === 'active').length}</div>
              <p className="text-sm text-gray-500">Active Themes</p>
            </div>
          </div>
        </Card>
      )}

      {/* Navigation Tabs */}
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
                {tab.count !== undefined && (
                  <span className="ml-1 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="p-6">
          {/* Plugins Tab */}
          {activeTab === 'plugins' && (
            <div className="space-y-6">
              {/* Plugin Actions */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search plugins..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  {selectedPlugins.length > 0 && (
                    <>
                      <Button variant="secondary" size="sm">
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Update Selected
                      </Button>
                      <Button variant="secondary" size="sm">
                        <EyeOff className="w-4 h-4 mr-1" />
                        Deactivate Selected
                      </Button>
                    </>
                  )}
                  <Button variant="secondary" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Add Plugin
                  </Button>
                </div>
              </div>

              {/* Plugin Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPlugins.map((plugin: any, index: number) => {
                  const statusBadge = getPluginStatusBadge(plugin)
                  return (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start space-x-3">
                          <input
                            type="checkbox"
                            checked={selectedPlugins.includes(plugin.name)}
                            onChange={() => togglePluginSelection(plugin.name)}
                            className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-gray-900 truncate">{plugin.name}</h3>
                            <p className="text-xs text-gray-500">v{plugin.version}</p>
                          </div>
                        </div>
                        <Badge variant={statusBadge.variant}>
                          {statusBadge.text}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Source: {plugin.source || 'wordpress'}</span>
                          {plugin.last_updated && (
                            <span>Updated: {new Date(plugin.last_updated).toLocaleDateString()}</span>
                          )}
                        </div>

                        {plugin.update === 'available' && (
                          <div className="flex items-center space-x-2 text-xs text-blue-600">
                            <AlertCircle className="w-3 h-3" />
                            <span>Update available</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowPluginDetails(showPluginDetails === plugin.name ? null : plugin.name)}
                          >
                            <Info className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex items-center space-x-1">
                          {plugin.status === 'active' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handlePluginAction(plugin.name, 'deactivate')}
                            >
                              <EyeOff className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handlePluginAction(plugin.name, 'activate')}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          {plugin.update === 'available' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleUpdatePlugin(plugin.name)}
                              title="Update Plugin"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Plugin Details */}
                      {showPluginDetails === plugin.name && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <p className="text-xs text-gray-600">
                            Plugin details and description would appear here. This would include information about the plugin author, compatibility, and any special configurations.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredPlugins.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    <Puzzle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No plugins found</p>
                  </div>
                )}
              </div>

              {/* Plugin Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card title="Plugin Statistics">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Plugins</span>
                      <span className="font-medium">{plugins.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Active</span>
                      <span className="font-medium text-green-600">{plugins.filter((p: any) => p.status === 'active').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Updates Available</span>
                      <span className="font-medium text-blue-600">{plugins.filter((p: any) => p.update === 'available').length}</span>
                    </div>
                  </div>
                </Card>

                <Card title="Plugin Sources">
                  <div className="space-y-2 text-sm">
                    {Array.from(new Set(plugins.map((p: any) => p.source || 'wordpress'))).map((source) => {
                      const count = plugins.filter((p: any) => (p.source || 'wordpress') === source).length
                      return (
                        <div key={source as string} className="flex justify-between">
                          <span className="text-gray-600 capitalize">{source}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      )
                    })}
                  </div>
                </Card>

                <Card title="Quick Actions">
                  <div className="space-y-2">
                    <Button
                      variant="secondary"
                      className="w-full justify-start text-sm"
                      onClick={handleUpdateAllPlugins}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Update All Plugins
                    </Button>
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <EyeOff className="w-4 h-4 mr-2" />
                      Deactivate All
                    </Button>
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Install Plugin
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Themes Tab */}
          {activeTab === 'themes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Themes</h3>
                <div className="flex items-center space-x-3">
                  <Button
                    variant="secondary"
                    onClick={handleUpdateAllThemes}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Update All
                  </Button>
                  <Button variant="primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Theme
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {themes.map((theme: any, index: number) => {
                  const statusBadge = getThemeStatusBadge(theme)
                  const isActive = theme.status === 'active'
                  return (
                    <div key={index} className={`bg-white border rounded-lg overflow-hidden ${isActive ? 'border-primary-500 shadow-lg' : 'border-gray-200'}`}>
                      {/* Theme Preview */}
                      <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <Palette className="w-12 h-12 text-gray-400" />
                      </div>

                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-900">{theme.name}</h3>
                          <Badge variant={statusBadge.variant}>
                            {statusBadge.text}
                          </Badge>
                        </div>

                        <p className="text-xs text-gray-500 mb-3">Version {theme.version}</p>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            {isActive && <CheckCircle className="w-3 h-3 text-green-500" />}
                            <span>{isActive ? 'Active Theme' : 'Available'}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            {isActive ? (
                              <Button variant="secondary" size="sm">
                                <Settings className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleThemeAction(theme.name, 'activate')}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            {theme.update === 'available' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleUpdateTheme(theme.name)}
                                title="Update Theme"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {themes.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    <Palette className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No themes found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WordPress Core Tab */}
          {activeTab === 'core' && wordpressInfo && (
            <div className="space-y-6">
              <Card title="WordPress Core Information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Current Version</span>
                      <Badge variant="success">{wordpressInfo.version}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Database Version</span>
                      <span className="text-sm text-gray-600">{wordpressInfo.database_version}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">PHP Version</span>
                      <span className="text-sm text-gray-600">{wordpressInfo.php_version}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Multisite</span>
                      <Badge variant={wordpressInfo.multisite ? 'success' : 'default'}>
                        {wordpressInfo.multisite ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Site URL</span>
                      <a href={wordpressInfo.site_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                        {wordpressInfo.site_url}
                      </a>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Home URL</span>
                      <a href={wordpressInfo.home_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                        {wordpressInfo.home_url}
                      </a>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Users</span>
                      <span className="text-sm text-gray-600">{wordpressInfo.users_count}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Content</span>
                      <span className="text-sm text-gray-600">{wordpressInfo.posts_count} posts, {wordpressInfo.pages_count} pages</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Core Updates</p>
                      <p className="text-xs text-gray-500">Update WordPress core to the latest version</p>
                    </div>
                    <Button variant="secondary" onClick={handleUpdateWordPressCore}>
                      <Download className="w-4 h-4 mr-2" />
                      Update WordPress
                    </Button>
                  </div>
                </div>
              </Card>

              <Card title="Core Management">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Manage WordPress core updates and maintenance tasks.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Button variant="secondary" className="justify-start">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Update WordPress Core
                    </Button>
                    <Button variant="secondary" className="justify-start">
                      <Database className="w-4 h-4 mr-2" />
                      Optimize Database
                    </Button>
                    <Button variant="secondary" className="justify-start">
                      <Shield className="w-4 h-4 mr-2" />
                      Run Security Check
                    </Button>
                    <Button variant="secondary" className="justify-start">
                      <Activity className="w-4 h-4 mr-2" />
                      Clear Caches
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Site Health Tab */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              <Card title="Site Health Overview">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">92%</div>
                    <p className="text-sm text-gray-500">Overall Health Score</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">0</div>
                    <p className="text-sm text-gray-500">Critical Issues</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-600">3</div>
                    <p className="text-sm text-gray-500">Recommended Improvements</p>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Health Checks">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">WordPress Version</span>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">PHP Version</span>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Database Connection</span>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">HTTPS Status</span>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">File Permissions</span>
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    </div>
                  </div>
                </Card>

                <Card title="Performance Metrics">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Page Load Time</span>
                      <span className="text-sm font-medium">1.2s</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Database Queries</span>
                      <span className="text-sm font-medium">42</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Memory Usage</span>
                      <span className="text-sm font-medium">64 MB</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Disk Space</span>
                      <span className="text-sm font-medium">45% used</span>
                    </div>
                  </div>
                </Card>
              </div>

              <Card title="Recommendations">
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Update Outdated Plugins</p>
                      <p className="text-xs text-gray-600">3 plugins have updates available with security improvements.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Optimize Database</p>
                      <p className="text-xs text-gray-600">Database tables could benefit from optimization.</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Enable Caching</p>
                      <p className="text-xs text-gray-600">Consider enabling caching for better performance.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Database Tab */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              <Card title="Database Information">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">8.0.33</div>
                    <p className="text-sm text-gray-500">Database Version</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">125 MB</div>
                    <p className="text-sm text-gray-500">Database Size</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">24</div>
                    <p className="text-sm text-gray-500">Total Tables</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">UTF8</div>
                    <p className="text-sm text-gray-500">Character Set</p>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Database Operations">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">Perform database maintenance operations.</p>
                    <div className="space-y-2">
                      <Button variant="secondary" className="w-full justify-start">
                        <Database className="w-4 h-4 mr-2" />
                        Optimize Database
                      </Button>
                      <Button variant="secondary" className="w-full justify-start">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Repair Database
                      </Button>
                      <Button variant="secondary" className="w-full justify-start">
                        <Download className="w-4 h-4 mr-2" />
                        Create Backup
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card title="Database Tables">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {[
                      { name: 'wp_posts', size: '45 MB', rows: 1234 },
                      { name: 'wp_postmeta', size: '32 MB', rows: 8901 },
                      { name: 'wp_options', size: '8 MB', rows: 567 },
                      { name: 'wp_users', size: '2 MB', rows: 45 },
                    ].map((table, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm font-medium">{table.name}</span>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <span>{table.size}</span>
                          <span>{table.rows} rows</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WordPressManager