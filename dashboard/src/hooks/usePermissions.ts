import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@/services/api'

interface PermissionsData {
  is_superuser: boolean
  permissions: string[]
}

/**
 * Hook for checking user permissions.
 * 
 * Usage:
 * const { can, canAny, canAll, isAdmin } = usePermissions()
 * 
 * // Check single permission
 * if (can('projects.create')) { ... }
 * 
 * // Check any of multiple
 * if (canAny(['projects.edit', 'projects.delete'])) { ... }
 * 
 * // Check all of multiple
 * if (canAll(['users.view', 'users.manage'])) { ... }
 */
export function usePermissions() {
  const { data, isLoading } = useQuery<{ data: PermissionsData }>({
    queryKey: ['user-permissions'],
    queryFn: dashboardApi.getCurrentUserPermissions,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
  })

  const permissions = data?.data?.permissions || []
  const isAdmin = data?.data?.is_superuser || false

  /**
   * Check if user has a specific permission
   */
  const can = (permission: string): boolean => {
    if (isAdmin) return true
    if (permissions.includes('*')) return true
    
    // Check exact match
    if (permissions.includes(permission)) return true
    
    // Check wildcard (e.g., 'projects.*' matches 'projects.create')
    const [resource] = permission.split('.')
    if (permissions.includes(`${resource}.*`)) return true
    
    return false
  }

  /**
   * Check if user has any of the given permissions
   */
  const canAny = (perms: string[]): boolean => {
    return perms.some(p => can(p))
  }

  /**
   * Check if user has all of the given permissions
   */
  const canAll = (perms: string[]): boolean => {
    return perms.every(p => can(p))
  }

  /**
   * Check if user can view a resource (read-only)
   */
  const canView = (resource: string): boolean => {
    return can(`${resource}.view`)
  }

  /**
   * Check if user can modify a resource (create/edit/delete)
   */
  const canModify = (resource: string): boolean => {
    return canAny([
      `${resource}.create`,
      `${resource}.edit`,
      `${resource}.delete`,
    ])
  }

  return {
    can,
    canAny,
    canAll,
    canView,
    canModify,
    isAdmin,
    permissions,
    isLoading,
  }
}

export default usePermissions
