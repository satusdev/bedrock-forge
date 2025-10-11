import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Globe,
  Github,
  HardDrive,
  WordPress,
  Server,
  Users,
  Settings,
  Activity,
  CheckCircle,
  AlertTriangle,
  Clock,
  Play,
  Square,
  ExternalLink,
  RefreshCw,
  Download
} from 'lucide-react'
import { dashboardApi } from '@/services/api'
import { useDashboardStore } from '@/store/useDashboardStore'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import ProjectOverview from './ProjectOverview'
import GitHubIntegration from './GitHubIntegration'
import GoogleDriveBackup from './GoogleDriveBackup'
import WordPressManager from './WordPressManager'
import ServerInfo from './ServerInfo'
import ClientInfo from './ClientInfo'

interface ProjectDetailLayoutProps {
  projectName: string
}

const ProjectDetailLayout: React.FC<ProjectDetailLayoutProps> = ({ projectName }) => {
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch project data
  const { data: project, isLoading, error } = useQuery(
    ['project', projectName],
    () => dashboardApi.getProjectStatus(projectName),
    {
      enabled: !!projectName,
    }
  )

  // Fetch comprehensive project data
  const { data: comprehensiveProject } = useQuery(
    ['comprehensive-project', projectName],
    async () => {
      const projects = await dashboardApi.getComprehensiveProjects()
      return projects.data.find((p: any) => p.project_name === projectName)
    },
    {
      enabled: !!projectName,
    }
  )

  const projectData = comprehensiveProject || project?.data

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Globe },
    { id: 'github', name: 'GitHub', icon: Github },
    { id: 'backups', name: 'Backups', icon: HardDrive },
    { id: 'wordpress', name: 'WordPress', icon: WordPress },
    { id: 'server', name: 'Server', icon: Server },
    { id: 'client', name: 'Client', icon: Users },
  ]

  const getHealthStatusColor = (healthScore: number) => {
    if (healthScore >= 90) return 'text-green-600 bg-green-100'
    if (healthScore >= 70) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'maintenance':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />
      default:
        return <Activity className="w-4 h-4 text-gray-500" />
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !projectData) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Project not found</h3>
        <p className="mt-2 text-gray-500">The project you're looking for doesn't exist.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{projectData.project_name}</h1>
                <div className="flex items-center space-x-4 mt-2">
                  <div className="flex items-center space-x-1">
                    {getStatusIcon(projectData.status)}
                    <span className="text-sm text-gray-600">{projectData.status}</span>
                  </div>
                  <span className="text-sm text-gray-400">•</span>
                  <span className="text-sm text-gray-600">Updated {new Date(projectData.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Health Score */}
            <div className="text-center">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getHealthStatusColor(projectData.health_score)}`}>
                {projectData.health_score}% Health
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-2">
              <Button variant="secondary" size="sm">
                <Play className="w-4 h-4 mr-1" />
                Start
              </Button>
              <Button variant="secondary" size="sm">
                <RefreshCw className="w-4 h-4 mr-1" />
                Pull
              </Button>
              <Button variant="secondary" size="sm">
                <ExternalLink className="w-4 h-4 mr-1" />
                Open
              </Button>
            </div>
          </div>
        </div>

        {/* Environment URLs */}
        {projectData.environments && Object.keys(projectData.environments).length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Environments</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(projectData.environments).map(([envType, env]: [string, any]) => (
                <div key={envType} className="flex items-center space-x-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <Badge variant={env.type === 'local' ? 'info' : env.type === 'production' ? 'success' : 'warning'}>
                    {env.type}
                  </Badge>
                  <a
                    href={env.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                  >
                    <span>{env.url.replace(/^https?:\/\//, '')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {env.ddev_status && (
                    <Badge variant={env.ddev_status === 'running' ? 'success' : 'warning'}>
                      {env.ddev_status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
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
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {activeTab === 'overview' && <ProjectOverview project={projectData} />}
        {activeTab === 'github' && <GitHubIntegration project={projectData} />}
        {activeTab === 'backups' && <GoogleDriveBackup project={projectData} />}
        {activeTab === 'wordpress' && <WordPressManager project={projectData} />}
        {activeTab === 'server' && <ServerInfo project={projectData} />}
        {activeTab === 'client' && <ClientInfo project={projectData} />}
      </div>
    </div>
  )
}

export default ProjectDetailLayout