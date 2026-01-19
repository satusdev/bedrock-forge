/**
 * Shared types for Bulk Operations components
 */

export interface Project {
  id: string
  name: string
  domain: string
  client: string
  server: string
  status: 'active' | 'development' | 'maintenance' | 'error'
  last_backup: Date
  wp_version: string
  php_version: string
  plugins_count: number
  themes_count: number
  ssl_status: 'valid' | 'expiring' | 'expired'
  disk_usage: number
  monthly_visitors: number
}

export interface BulkOperation {
  id: string
  name: string
  description: string
  icon: string
  category: 'maintenance' | 'security' | 'updates' | 'backups' | 'performance'
  requires_confirmation: boolean
  estimated_time: string
  impact_level: 'low' | 'medium' | 'high'
}

export interface OperationTask {
  id: string
  operation_id: string
  project_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  started_at?: Date
  completed_at?: Date
  error_message?: string
  result?: any
}

export interface ScheduledJob {
  id: string
  name: string
  operation_id: string
  schedule: string
  target_projects: string[]
  enabled: boolean
  last_run?: Date
  next_run?: Date
}

export interface OperationTemplate {
  id: string
  name: string
  description: string
  operations: string[]
  target_filter: {
    status?: string[]
    client?: string[]
    server?: string[]
  }
}

// Helper functions
export const getStatusColor = (status: Project['status']) => {
  switch (status) {
    case 'active': return 'green'
    case 'development': return 'blue'
    case 'maintenance': return 'yellow'
    case 'error': return 'red'
    default: return 'gray'
  }
}

export const getSSLStatusColor = (status: Project['ssl_status']) => {
  switch (status) {
    case 'valid': return 'green'
    case 'expiring': return 'yellow'
    case 'expired': return 'red'
    default: return 'gray'
  }
}

export const getTaskStatusColor = (status: OperationTask['status']) => {
  switch (status) {
    case 'pending': return 'gray'
    case 'running': return 'blue'
    case 'completed': return 'green'
    case 'failed': return 'red'
    case 'cancelled': return 'yellow'
    default: return 'gray'
  }
}

export const getImpactLevelColor = (level: BulkOperation['impact_level']) => {
  switch (level) {
    case 'low': return 'green'
    case 'medium': return 'yellow'
    case 'high': return 'red'
    default: return 'gray'
  }
}
