import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FolderKanban,
  Activity,
  Users,
  Github,
  AlertTriangle,
  CheckCircle,
  Cloud,
  Wifi,
  WifiOff
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { dashboardApi } from '@/services/api'
import { useDashboardStore } from '@/store/useDashboardStore'
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates'

const Dashboard: React.FC = () => {
  const { setStats, setProjects, setGitHubAuthenticated, setGoogleDriveAuthenticated } = useDashboardStore()

  // Set up real-time updates
  const { isConnected, subscribeToProject, unsubscribeFromProject } = useRealTimeUpdates({
    onDdevStatusChange: (projectName, status, message) => {
      // DDEV status changes are handled automatically via query invalidation
      console.log(`DDEV status changed for ${projectName}: ${status}`)
    },
    onConnectionChange: (connected) => {
      console.log('Real-time updates connection changed:', connected)
    }
  })

  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
    onSuccess: (response: any) => {
      setStats(response.data)
    },
  })

  // Fetch projects
  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ['comprehensive-projects'],
    queryFn: dashboardApi.getComprehensiveProjects,
    onSuccess: (response: any) => {
      setProjects(response.data)
    },
  })

  // Check GitHub auth status
  useQuery({
    queryKey: ['github-auth-status'],
    queryFn: dashboardApi.getGitHubAuthStatus,
    onSuccess: (response: any) => {
      setGitHubAuthenticated(response.data.authenticated)
    },
  })

  // Check Google Drive auth status
  useQuery({
    queryKey: ['google-drive-auth-status'],
    queryFn: dashboardApi.getGoogleDriveAuthStatus,
    onSuccess: (response: any) => {
      setGoogleDriveAuthenticated(response.data.authenticated)
    },
  })

  const statsData = stats?.data
  const projectsData = projects?.data || []

  // Get recent projects (last 5)
  const recentProjects = projectsData
    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)

  // Get projects with issues
  const projectsWithIssues = projectsData.filter((project: any) =>
    project.health_score < 80 || project.status === 'error'
  )

  const statCards = [
    {
      title: 'Total Projects',
      value: statsData?.total_projects || 0,
      icon: FolderKanban,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Active Projects',
      value: statsData?.active_projects || 0,
      icon: Activity,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Total Clients',
      value: new Set(projectsData.map((p: any) => p.client?.name).filter(Boolean)).size,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      title: 'Healthy Sites',
      value: statsData?.healthy_sites || 0,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100'
    }
  ]

  if (statsLoading || projectsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back! Here's an overview of your WordPress projects.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Connection Status */}
          <div className="flex items-center space-x-2 px-3 py-1 rounded-lg bg-gray-100">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-600" />
                <span className="text-sm text-red-700">Offline</span>
              </>
            )}
          </div>
          <Link to="/projects">
            <Button variant="primary">View All Projects</Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <div className="flex items-center">
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <Card title="Recent Projects">
          <div className="space-y-4">
            {recentProjects.length > 0 ? (
              recentProjects.map((project: any) => (
                <div key={project.project_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-medium text-gray-900">{project.project_name}</h4>
                      <Badge
                        variant={project.status === 'active' ? 'success' : 'warning'}
                      >
                        {project.status}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                      <span>Health: {project.health_score}%</span>
                      <span>Client: {project.client?.name || 'N/A'}</span>
                    </div>
                  </div>
                  <Link to={`/projects/${project.project_name}`}>
                    <Button variant="ghost" size="sm">View</Button>
                  </Link>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FolderKanban className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No projects yet</p>
                <Link to="/projects" className="mt-2 inline-block">
                  <Button size="sm">Create Project</Button>
                </Link>
              </div>
            )}
          </div>
        </Card>

        {/* Projects with Issues */}
        <Card title="Projects Needing Attention">
          <div className="space-y-4">
            {projectsWithIssues.length > 0 ? (
              projectsWithIssues.map((project: any) => (
                <div key={project.project_name} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{project.project_name}</h4>
                      <p className="text-xs text-gray-500">
                        Health Score: {project.health_score}% • {project.status}
                      </p>
                    </div>
                  </div>
                  <Link to={`/projects/${project.project_name}`}>
                    <Button variant="danger" size="sm">Fix</Button>
                  </Link>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-green-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                <p>All projects are healthy!</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Integration Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="GitHub Integration">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Github className="w-6 h-6 text-gray-700" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Repository Sync</h4>
                  <p className="text-xs text-gray-500">Connect your GitHub repositories</p>
                </div>
              </div>
              <Badge variant={stats?.data?.github_authenticated ? 'success' : 'warning'}>
                {stats?.data?.github_authenticated ? 'Connected' : 'Not Connected'}
              </Badge>
            </div>
            <Button className="w-full" variant="secondary">
              Configure GitHub
            </Button>
          </div>
        </Card>

        <Card title="Google Drive Integration">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Cloud className="w-6 h-6 text-gray-700" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Backup Storage</h4>
                  <p className="text-xs text-gray-500">Automatic backups to Google Drive</p>
                </div>
              </div>
              <Badge variant={stats?.data?.google_drive_authenticated ? 'success' : 'warning'}>
                {stats?.data?.google_drive_authenticated ? 'Connected' : 'Not Connected'}
              </Badge>
            </div>
            <Button className="w-full" variant="secondary">
              Configure Google Drive
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Dashboard