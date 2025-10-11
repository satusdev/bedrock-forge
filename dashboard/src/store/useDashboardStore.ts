import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { DashboardProject, DashboardStats, ClientInfo, TaskStatus } from '@/types/index'

interface DashboardState {
  // State
  projects: DashboardProject[]
  stats: DashboardStats | null
  clients: ClientInfo[]
  tasks: Record<string, TaskStatus>
  selectedProject: DashboardProject | null
  loading: boolean
  error: string | null

  // GitHub state
  githubAuthenticated: boolean
  googleDriveAuthenticated: boolean

  // Actions
  setProjects: (projects: DashboardProject[]) => void
  setStats: (stats: DashboardStats) => void
  setClients: (clients: ClientInfo[]) => void
  setTaskStatus: (taskId: string, status: TaskStatus) => void
  setSelectedProject: (project: DashboardProject | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setGitHubAuthenticated: (authenticated: boolean) => void
  setGoogleDriveAuthenticated: (authenticated: boolean) => void

  // Computed
  getProjectByName: (name: string) => DashboardProject | undefined
  getActiveProjects: () => DashboardProject[]
  getProjectsByClient: (clientName: string) => DashboardProject[]
  getRunningTasks: () => TaskStatus[]
}

export const useDashboardStore = create<DashboardState>()(
  devtools(
    (set, get) => ({
      // Initial state
      projects: [],
      stats: null,
      clients: [],
      tasks: {},
      selectedProject: null,
      loading: false,
      error: null,
      githubAuthenticated: false,
      googleDriveAuthenticated: false,

      // Actions
      setProjects: (projects) => set({ projects }),

      setStats: (stats) => set({ stats }),

      setClients: (clients) => set({ clients }),

      setTaskStatus: (taskId, status) =>
        set((state) => ({
          tasks: { ...state.tasks, [taskId]: status }
        })),

      setSelectedProject: (project) => set({ selectedProject: project }),

      setLoading: (loading) => set({ loading }),

      setError: (error) => set({ error }),

      setGitHubAuthenticated: (authenticated) => set({ githubAuthenticated: authenticated }),

      setGoogleDriveAuthenticated: (authenticated) => set({ googleDriveAuthenticated: authenticated }),

      // Computed getters
      getProjectByName: (name) => {
        const { projects } = get()
        return projects.find(p => p.project_name === name)
      },

      getActiveProjects: () => {
        const { projects } = get()
        return projects.filter(p => p.status === 'active')
      },

      getProjectsByClient: (clientName) => {
        const { projects } = get()
        return projects.filter(p => p.client?.name === clientName)
      },

      getRunningTasks: () => {
        const { tasks } = get()
        return Object.values(tasks).filter(t => t.status === 'running')
      },
    }),
    {
      name: 'dashboard-store',
    }
  )
)