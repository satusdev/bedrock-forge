export type ProjectStatus = 'active' | 'inactive' | 'maintenance' | 'archived' | 'error'
export type EnvironmentType = 'local' | 'staging' | 'production'
export type HostingProvider = 'hetzner' | 'cyberpanel' | 'libyanspider' | 'digitalocean' | 'vultr' | 'aws' | 'custom'
export type SSLStatus = 'valid' | 'expiring_soon' | 'expired' | 'not_installed' | 'error'

export interface Environment {
  type: EnvironmentType
  url: string
  ddev_status?: string
  wordpress_version?: string
  php_version?: string
  database_host?: string
  database_name?: string
  last_updated?: string
  health_score: number
}

export interface GitHubIntegration {
  repository_url: string
  branch: string
  commit_hash?: string
  last_sync?: string
  webhook_id?: string
  auto_deploy: boolean
}

export interface GoogleDriveIntegration {
  backup_folder_id?: string
  backup_folder_url?: string
  auto_backup: boolean
  backup_schedule: string
  last_backup?: string
  storage_used: number
}

export interface ServerInfo {
  provider: HostingProvider
  server_ip: string
  ssh_user: string
  ssh_port: number
  ssh_key_path?: string
  server_name?: string
  location?: string
  specs: Record<string, any>
  resource_usage: Record<string, number>
  monthly_cost: number
  renewal_date?: string
}

export interface SSLCertificate {
  domain: string
  status: SSLStatus
  issuer?: string
  issued_date?: string
  expiry_date?: string
  auto_renewal: boolean
}

export interface PluginInfo {
  name: string
  version: string
  status: string
  last_updated?: string
  source: string
}

export interface ThemeInfo {
  name: string
  version: string
  status: string
  child_theme: boolean
  customizations: string[]
  last_updated?: string
}

export interface ClientInfo {
  name: string
  email: string
  phone?: string
  company?: string
  billing_status: string
  monthly_rate: number
  contract_start?: string
  contract_end?: string
  notes: string
  contact_person?: string
}

export interface BackupInfo {
  last_backup?: string
  backup_locations: string[]
  backup_schedule: string
  retention_days: number
  total_backups: number
  backup_size: number
  google_drive_sync: boolean
  local_backup_path?: string
}

export interface AnalyticsInfo {
  monthly_visitors: number
  page_load_time: number
  uptime_percentage: number
  last_uptime_check?: string
  error_count_24h: number
  server_response_time: number
}

export interface DashboardProject {
  project_name: string
  directory: string
  status: ProjectStatus
  created_at: string
  updated_at: string
  primary_url: string
  health_score: number
  tags: string[]
  notes: string
  client?: ClientInfo
  environments: Record<EnvironmentType, Environment>
  github?: GitHubIntegration
  google_drive?: GoogleDriveIntegration
  server?: ServerInfo
  ssl_certificate?: SSLCertificate
  plugins: PluginInfo[]
  themes: ThemeInfo[]
  backup: BackupInfo
  analytics: AnalyticsInfo
}

export interface DashboardStats {
  total_projects: number
  active_projects: number
  total_servers: number
  healthy_sites: number
  recent_deployments: number
  failed_backups: number
}

export interface TaskStatus {
  status: 'running' | 'completed' | 'failed'
  message: string
  started_at?: string
  completed_at?: string
  error?: string
  output?: string
}

export interface GitHubRepository {
  name: string
  full_name: string
  description?: string
  url: string
  clone_url: string
  ssh_url: string
  default_branch: string
  language?: string
  stars: number
  forks: number
  open_issues: number
  created_at?: string
  updated_at?: string
  pushed_at?: string
  size: number
  is_private: boolean
  owner: {
    login: string
    name?: string
    avatar_url: string
  }
}

export interface GoogleDriveFile {
  id: string
  name: string
  size: number
  mime_type: string
  created_time: string
  modified_time: string
  parents: string[]
  url: string
}

export interface GoogleDriveStorage {
  limit: number
  usage: number
  usage_in_drive: number
  usage_in_drive_trash: number
  usage_percent: number
}