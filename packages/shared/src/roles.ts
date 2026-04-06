// ─── RBAC Roles ───────────────────────────────────────────────────────────────

export const ROLES = {
	ADMIN: 'admin',
	MANAGER: 'manager',
	CLIENT: 'client',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: Record<Role, number> = {
	admin: 3,
	manager: 2,
	client: 1,
};

/**
 * Returns true if the given role has at least the minimum required role level.
 */
export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
	return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
