import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Github,
  GitBranch,
  GitCommit,
  GitPullRequest,
  GitMerge,
  RefreshCw,
  ExternalLink,
  Settings,
  AlertTriangle,
  CheckCircle,
  Clock,
  Code,
  GitFork,
  Star,
  Eye,
  Calendar,
  User,
  MessageSquare,
  Plus,
  Play
} from 'lucide-react'
import { dashboardApi } from '@/services/api'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'

interface GitHubIntegrationProps {
  project: any
}

const GitHubIntegration: React.FC<GitHubIntegrationProps> = ({ project }) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [showWebhookForm, setShowWebhookForm] = useState(false)
  const [showAuthForm, setShowAuthForm] = useState(false)
  const [showRepoConnectForm, setShowRepoConnectForm] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [repoBranch, setRepoBranch] = useState('main')

  const queryClient = useQueryClient()

  // Check GitHub auth status
  const { data: authStatus } = useQuery(
    ['github-auth-status'],
    dashboardApi.getGitHubAuthStatus,
    {
      refetchInterval: 30000, // Check every 30 seconds
    }
  )

  // Get repository info if GitHub is configured
  const { data: repoInfo, isLoading: repoLoading } = useQuery(
    ['github-repo', project.github?.repository_url],
    () => dashboardApi.getRepositoryInfo(project.github?.repository_url),
    {
      enabled: !!(project.github?.repository_url && authStatus?.data?.authenticated),
    }
  )

  // Get branches
  const { data: branches } = useQuery(
    ['github-branches', project.github?.repository_url],
    () => dashboardApi.getRepositoryBranches(project.github?.repository_url),
    {
      enabled: !!(project.github?.repository_url && authStatus?.data?.authenticated),
    }
  )

  // Get commits
  const { data: commits } = useQuery(
    ['github-commits', project.github?.repository_url, project.github?.branch],
    () => dashboardApi.getRepositoryCommits(project.github?.repository_url, project.github?.branch, 10),
    {
      enabled: !!(project.github?.repository_url && authStatus?.data?.authenticated),
    }
  )

  // Get pull requests
  const { data: pullRequests } = useQuery(
    ['github-prs', project.github?.repository_url],
    () => dashboardApi.getRepositoryPullRequests(project.github?.repository_url, 'open'),
    {
      enabled: !!(project.github?.repository_url && authStatus?.data?.authenticated),
    }
  )

  // Get Git status
  const { data: gitStatus } = useQuery(
    ['git-status', project.project_name],
    () => dashboardApi.getRepositoryStatus(project.project_name),
    {
      enabled: !!project.project_name,
    }
  )

  // Get deployments
  const { data: deployments } = useQuery(
    ['github-deployments', project.github?.repository_url],
    () => dashboardApi.getRepositoryDeployments(project.github?.repository_url),
    {
      enabled: !!(project.github?.repository_url && authStatus?.data?.authenticated),
    }
  )

  // Pull changes mutation
  const pullChanges = useMutation(
    () => dashboardApi.pullRepository(project.project_name, project.github?.branch),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['git-status', project.project_name])
        queryClient.invalidateQueries(['github-commits', project.github?.repository_url])
      },
    }
  )

  // Create webhook mutation
  const createWebhook = useMutation(
    (webhookData: any) => dashboardApi.createWebhook(webhookData),
    {
      onSuccess: () => {
        setShowWebhookForm(false)
        setWebhookUrl('')
        queryClient.invalidateQueries(['github-webhooks', project.github?.repository_url])
      },
    }
  )

  // Create deployment mutation
  const createDeployment = useMutation(
    (deploymentData: any) => dashboardApi.createDeployment(deploymentData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['github-deployments', project.github?.repository_url])
      },
    }
  )

  // Authenticate with GitHub mutation
  const authenticateGitHub = useMutation(
    (token: string) => dashboardApi.authenticateGitHub(token),
    {
      onSuccess: () => {
        setShowAuthForm(false)
        setGithubToken('')
        queryClient.invalidateQueries(['github-auth-status'])
        toast.success('GitHub authentication successful!')
      },
      onError: (error: any) => {
        toast.error(`GitHub authentication failed: ${error.message}`)
      }
    }
  )

  // Connect repository mutation
  const connectRepository = useMutation(
    (repoData: any) => dashboardApi.updateGitHubIntegration(project.project_name, repoData),
    {
      onSuccess: () => {
        setShowRepoConnectForm(false)
        setRepoUrl('')
        setRepoBranch('main')
        queryClient.invalidateQueries(['comprehensive-project', project.project_name])
        queryClient.invalidateQueries(['github-repo'])
        toast.success('Repository connected successfully!')
      },
      onError: (error: any) => {
        toast.error(`Failed to connect repository: ${error.message}`)
      }
    }
  )

  const isAuthenticated = authStatus?.data?.authenticated
  const hasGitHubConfig = !!project.github?.repository_url

  const handlePullChanges = () => {
    pullChanges.mutate()
  }

  const handleCreateWebhook = () => {
    if (!webhookUrl || !project.github?.repository_url) return

    createWebhook.mutate({
      repository_url: project.github.repository_url,
      webhook_url: webhookUrl,
      events: ['push', 'pull_request', 'release']
    })
  }

  const handleCreateDeployment = (environment: string) => {
    if (!project.github?.repository_url || !project.github?.branch) return

    createDeployment.mutate({
      repository_url: project.github.repository_url,
      ref: project.github.branch,
      environment,
      description: `Deploy to ${environment} from Bedrock Forge Dashboard`
    })
  }

  const handleAuthenticateGitHub = () => {
    if (!githubToken.trim()) {
      toast.error('Please enter a GitHub access token')
      return
    }
    authenticateGitHub.mutate(githubToken)
  }

  const handleConnectRepository = () => {
    if (!repoUrl.trim()) {
      toast.error('Please enter a repository URL')
      return
    }
    connectRepository.mutate({
      repository_url: repoUrl,
      branch: repoBranch,
      auto_deploy: false
    })
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Github },
    { id: 'commits', name: 'Commits', icon: GitCommit },
    { id: 'branches', name: 'Branches', icon: GitBranch },
    { id: 'pulls', name: 'Pull Requests', icon: GitPullRequest },
    { id: 'deployments', name: 'Deployments', icon: Play },
    { id: 'settings', name: 'Settings', icon: Settings },
  ]

  const repoData = repoInfo?.data
  const branchesData = branches?.data || []
  const commitsData = commits?.data || []
  const prsData = pullRequests?.data?.pull_requests || []
  const deploymentsData = deployments?.data?.deployments || []
  const gitStatusData = gitStatus?.data

  if (!isAuthenticated) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-12">
            <Github className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">GitHub Not Connected</h3>
            <p className="text-gray-500 mb-6">Connect your GitHub account to enable repository management features.</p>
            {!showAuthForm ? (
              <Button variant="primary" onClick={() => setShowAuthForm(true)}>
                <Github className="w-4 h-4 mr-2" />
                Connect GitHub
              </Button>
            ) : (
              <div className="max-w-md mx-auto text-left">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GitHub Access Token
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Create a personal access token with repo permissions in GitHub Settings
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="primary"
                    onClick={handleAuthenticateGitHub}
                    disabled={authenticateGitHub.isLoading}
                  >
                    {authenticateGitHub.isLoading ? 'Authenticating...' : 'Authenticate'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowAuthForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  if (!hasGitHubConfig) {
    return (
      <div className="p-6">
        <Card>
          <div className="text-center py-12">
            <Github className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Repository Connected</h3>
            <p className="text-gray-500 mb-6">Connect a GitHub repository to enable version control features.</p>
            {!showRepoConnectForm ? (
              <Button variant="primary" onClick={() => setShowRepoConnectForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Connect Repository
              </Button>
            ) : (
              <div className="max-w-md mx-auto text-left">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Repository URL
                    </label>
                    <input
                      type="url"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/user/repo.git"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Branch
                    </label>
                    <input
                      type="text"
                      value={repoBranch}
                      onChange={(e) => setRepoBranch(e.target.value)}
                      placeholder="main"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="flex space-x-3 mt-6">
                  <Button
                    variant="primary"
                    onClick={handleConnectRepository}
                    disabled={connectRepository.isLoading}
                  >
                    {connectRepository.isLoading ? 'Connecting...' : 'Connect Repository'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowRepoConnectForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Repository Header */}
      {repoData && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <Github className="w-8 h-8 text-gray-700" />
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{repoData.name}</h3>
                  <p className="text-sm text-gray-500">{repoData.full_name}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <div className="flex items-center space-x-1">
                  <Star className="w-4 h-4" />
                  <span>{repoData.stars}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <GitFork className="w-4 h-4" />
                  <span>{repoData.forks}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Eye className="w-4 h-4" />
                  <span>{repoData.watchers || 0}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="secondary" size="sm" onClick={handlePullChanges} disabled={pullChanges.isLoading}>
                <RefreshCw className={`w-4 h-4 mr-1 ${pullChanges.isLoading ? 'animate-spin' : ''}`} />
                Pull Changes
              </Button>
              <a href={repoData.html_url} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  View on GitHub
                </Button>
              </a>
            </div>
          </div>

          {repoData.description && (
            <p className="mt-4 text-sm text-gray-600">{repoData.description}</p>
          )}

          <div className="mt-4 flex items-center space-x-4 text-sm">
            <Badge variant="info">{repoData.language || 'Unknown'}</Badge>
            <Badge variant={repoData.is_private ? 'warning' : 'success'}>
              {repoData.is_private ? 'Private' : 'Public'}
            </Badge>
            <span className="text-gray-500">Default: {repoData.default_branch}</span>
            <span className="text-gray-500">Size: {repoData.size} KB</span>
          </div>
        </Card>
      )}

      {/* Local Git Status */}
      {gitStatusData && (
        <Card title="Local Repository Status">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Branch</span>
              <Badge variant="info">{gitStatusData.branch}</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={gitStatusData.is_dirty ? 'warning' : 'success'}>
                {gitStatusData.is_dirty ? 'Modified' : 'Clean'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Ahead</span>
              <Badge variant="warning">{gitStatusData.ahead || 0}</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium">Behind</span>
              <Badge variant="warning">{gitStatusData.behind || 0}</Badge>
            </div>
          </div>

          {gitStatusData.last_commit && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium mb-2">Last Commit</p>
              <p className="text-sm text-gray-600 mb-1">{gitStatusData.last_commit.message}</p>
              <div className="flex items-center space-x-4 text-xs text-gray-500">
                <span>{gitStatusData.last_commit.author}</span>
                <span>{new Date(gitStatusData.last_commit.date).toLocaleDateString()}</span>
                <span>{gitStatusData.last_commit.sha.substring(0, 7)}</span>
              </div>
            </div>
          )}

          {gitStatusData.untracked_files && gitStatusData.untracked_files.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Untracked Files</p>
              <div className="space-y-1">
                {gitStatusData.untracked_files.slice(0, 5).map((file: string, index: number) => (
                  <div key={index} className="text-sm text-gray-600 bg-yellow-50 px-2 py-1 rounded">
                    {file}
                  </div>
                ))}
                {gitStatusData.untracked_files.length > 5 && (
                  <p className="text-xs text-gray-500">... and {gitStatusData.untracked_files.length - 5} more</p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tabs */}
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
              </button>
            )
          })}
        </nav>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Quick Actions">
                  <div className="space-y-3">
                    <Button
                      className="w-full justify-start"
                      variant="secondary"
                      onClick={() => handleCreateDeployment('staging')}
                      disabled={createDeployment.isLoading}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Deploy to Staging
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="secondary"
                      onClick={() => handleCreateDeployment('production')}
                      disabled={createDeployment.isLoading}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Deploy to Production
                    </Button>
                    <Button
                      className="w-full justify-start"
                      variant="secondary"
                      onClick={() => setShowWebhookForm(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Webhook
                    </Button>
                  </div>
                </Card>

                <Card title="Repository Info">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Repository URL</span>
                      <a href={project.github.repository_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        View
                      </a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Branch</span>
                      <span className="font-medium">{project.github.branch}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Auto Deploy</span>
                      <Badge variant={project.github.auto_deploy ? 'success' : 'warning'}>
                        {project.github.auto_deploy ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    {project.github.last_sync && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Last Sync</span>
                        <span>{new Date(project.github.last_sync).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Webhook Creation Form */}
              {showWebhookForm && (
                <Card title="Create Webhook">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Webhook URL
                      </label>
                      <input
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://your-domain.com/webhook"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <Button
                        variant="primary"
                        onClick={handleCreateWebhook}
                        disabled={createWebhook.isLoading || !webhookUrl}
                      >
                        {createWebhook.isLoading ? 'Creating...' : 'Create Webhook'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setShowWebhookForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Commits Tab */}
          {activeTab === 'commits' && (
            <div className="space-y-4">
              {commitsData.length > 0 ? (
                commitsData.map((commit: any, index: number) => (
                  <div key={commit.sha || index} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">
                      <GitCommit className="w-5 h-5 text-gray-400 mt-1" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{commit.message}</p>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <User className="w-3 h-3" />
                          <span>{commit.author?.name || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(commit.author?.date || commit.date).toLocaleDateString()}</span>
                        </div>
                        <span>{commit.sha?.substring(0, 7)}</span>
                        {commit.url && (
                          <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            View
                          </a>
                        )}
                      </div>
                      {commit.total && (
                        <div className="flex items-center space-x-4 mt-2 text-xs">
                          <span className="text-green-600">+{commit.additions}</span>
                          <span className="text-red-600">-{commit.deletions}</span>
                          <span className="text-gray-500">{commit.total} changes</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <GitCommit className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No commits found</p>
                </div>
              )}
            </div>
          )}

          {/* Branches Tab */}
          {activeTab === 'branches' && (
            <div className="space-y-4">
              {branchesData.length > 0 ? (
                branchesData.map((branch: any, index: number) => (
                  <div key={branch.name || index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <GitBranch className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{branch.name}</p>
                        {branch.commit && (
                          <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                            <span>{branch.commit.sha?.substring(0, 7)}</span>
                            <span>{branch.commit.author?.name}</span>
                            <span>{new Date(branch.commit.author?.date || branch.commit.date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {branch.protected && <Badge variant="info">Protected</Badge>}
                      {branch.name === project.github?.branch && <Badge variant="success">Current</Badge>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No branches found</p>
                </div>
              )}
            </div>
          )}

          {/* Pull Requests Tab */}
          {activeTab === 'pulls' && (
            <div className="space-y-4">
              {prsData.length > 0 ? (
                prsData.map((pr: any, index: number) => (
                  <div key={pr.number || index} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">
                      <GitPullRequest className="w-5 h-5 text-gray-400 mt-1" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">#{pr.number} {pr.title}</p>
                        <Badge variant={pr.state === 'open' ? 'success' : 'warning'}>
                          {pr.state}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <User className="w-3 h-3" />
                          <span>{pr.user?.login}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>{pr.comments || 0} comments</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(pr.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {pr.body && (
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{pr.body}</p>
                      )}
                      {pr.url && (
                        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs text-blue-600 hover:underline">
                          View on GitHub
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <GitPullRequest className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No pull requests found</p>
                </div>
              )}
            </div>
          )}

          {/* Deployments Tab */}
          {activeTab === 'deployments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Deployment History</h3>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCreateDeployment('staging')}
                    disabled={createDeployment.isLoading}
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Deploy to Staging
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleCreateDeployment('production')}
                    disabled={createDeployment.isLoading}
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Deploy to Production
                  </Button>
                </div>
              </div>

              {deploymentsData.length > 0 ? (
                deploymentsData.map((deployment: any, index: number) => (
                  <div key={deployment.id || index} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">
                      <Play className="w-5 h-5 text-gray-400 mt-1" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          Deploy to {deployment.environment}
                        </p>
                        <Badge variant="info">{deployment.environment}</Badge>
                      </div>
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <GitCommit className="w-3 h-3" />
                          <span>{deployment.sha?.substring(0, 7)}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(deployment.created_at).toLocaleDateString()}</span>
                        </div>
                        <span>Ref: {deployment.ref}</span>
                      </div>
                      {deployment.description && (
                        <p className="mt-2 text-sm text-gray-600">{deployment.description}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Play className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No deployments found</p>
                  <p className="text-sm text-gray-400 mt-1">Create your first deployment to get started</p>
                </div>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <Card title="Repository Settings">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Auto Deploy</p>
                      <p className="text-xs text-gray-500">Automatically deploy when changes are pushed</p>
                    </div>
                    <Badge variant={project.github.auto_deploy ? 'success' : 'warning'}>
                      {project.github.auto_deploy ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Default Branch</p>
                      <p className="text-xs text-gray-500">Branch used for deployments</p>
                    </div>
                    <Badge variant="info">{project.github.branch}</Badge>
                  </div>
                </div>
              </Card>

              <Card title="Webhooks">
                <p className="text-sm text-gray-600 mb-4">Configure webhooks to receive real-time updates from GitHub.</p>
                <Button
                  variant="primary"
                  onClick={() => setShowWebhookForm(true)}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Webhook
                </Button>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GitHubIntegration