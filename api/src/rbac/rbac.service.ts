import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoleCreateDto, RoleUpdateDto } from './dto/role.dto';

type DbPermission = {
	id: number;
	code: string;
	name: string;
	description: string | null;
	category: string | null;
};

type DbRoleRow = {
	id: number;
	name: string;
	display_name: string;
	description: string | null;
	color: string;
	is_system: boolean;
	permission_id: number | null;
	permission_code: string | null;
	permission_name: string | null;
	permission_description: string | null;
	permission_category: string | null;
};

const DEFAULT_PERMISSIONS = [
	{
		code: 'projects.view',
		name: 'View Projects',
		category: 'projects',
		description: 'View project list and details',
	},
	{
		code: 'projects.create',
		name: 'Create Projects',
		category: 'projects',
		description: 'Create new projects',
	},
	{
		code: 'projects.edit',
		name: 'Edit Projects',
		category: 'projects',
		description: 'Modify project settings',
	},
	{
		code: 'projects.delete',
		name: 'Delete Projects',
		category: 'projects',
		description: 'Delete projects permanently',
	},
	{
		code: 'servers.view',
		name: 'View Servers',
		category: 'servers',
		description: 'View server list and details',
	},
	{
		code: 'servers.manage',
		name: 'Manage Servers',
		category: 'servers',
		description: 'Add, edit, and remove servers',
	},
	{
		code: 'servers.scan',
		name: 'Scan Servers',
		category: 'servers',
		description: 'Scan servers for sites',
	},
	{
		code: 'clients.view',
		name: 'View Clients',
		category: 'clients',
		description: 'View client list and details',
	},
	{
		code: 'clients.manage',
		name: 'Manage Clients',
		category: 'clients',
		description: 'Add, edit, and remove clients',
	},
	{
		code: 'deployments.view',
		name: 'View Deployments',
		category: 'deployments',
		description: 'View deployment history',
	},
	{
		code: 'deployments.execute',
		name: 'Execute Deployments',
		category: 'deployments',
		description: 'Trigger and manage deployments',
	},
	{
		code: 'deployments.rollback',
		name: 'Rollback Deployments',
		category: 'deployments',
		description: 'Rollback to previous versions',
	},
	{
		code: 'backups.view',
		name: 'View Backups',
		category: 'backups',
		description: 'View backup list and status',
	},
	{
		code: 'backups.manage',
		name: 'Manage Backups',
		category: 'backups',
		description: 'Create, restore, and delete backups',
	},
	{
		code: 'backups.restore',
		name: 'Restore Backups',
		category: 'backups',
		description: 'Restore from backup files',
	},
	{
		code: 'monitoring.view',
		name: 'View Monitoring',
		category: 'monitoring',
		description: 'View monitoring dashboards',
	},
	{
		code: 'monitoring.manage',
		name: 'Manage Monitors',
		category: 'monitoring',
		description: 'Configure monitoring rules',
	},
	{
		code: 'monitoring.alerts',
		name: 'Manage Alerts',
		category: 'monitoring',
		description: 'Configure alert notifications',
	},
	{
		code: 'tags.view',
		name: 'View Tags',
		category: 'tags',
		description: 'View tag list',
	},
	{
		code: 'tags.manage',
		name: 'Manage Tags',
		category: 'tags',
		description: 'Create, edit, and delete tags',
	},
	{
		code: 'sync.view',
		name: 'View Sync Status',
		category: 'sync',
		description: 'View sync history and status',
	},
	{
		code: 'sync.execute',
		name: 'Execute Sync',
		category: 'sync',
		description: 'Trigger sync operations',
	},
	{
		code: 'reports.view',
		name: 'View Reports',
		category: 'reports',
		description: 'View system reports',
	},
	{
		code: 'reports.export',
		name: 'Export Reports',
		category: 'reports',
		description: 'Export reports to files',
	},
	{
		code: 'audit.view',
		name: 'View Audit Logs',
		category: 'audit',
		description: 'View system audit logs',
	},
	{
		code: 'audit.export',
		name: 'Export Audit Logs',
		category: 'audit',
		description: 'Export audit logs to files',
	},
	{
		code: 'templates.view',
		name: 'View Templates',
		category: 'templates',
		description: 'View project templates',
	},
	{
		code: 'templates.manage',
		name: 'Manage Templates',
		category: 'templates',
		description: 'Create and edit templates',
	},
	{
		code: 'settings.view',
		name: 'View Settings',
		category: 'settings',
		description: 'View system settings',
	},
	{
		code: 'settings.manage',
		name: 'Manage Settings',
		category: 'settings',
		description: 'Modify system settings',
	},
	{
		code: 'users.view',
		name: 'View Users',
		category: 'users',
		description: 'View user list',
	},
	{
		code: 'users.manage',
		name: 'Manage Users',
		category: 'users',
		description: 'Add, edit, and remove users',
	},
	{
		code: 'roles.view',
		name: 'View Roles',
		category: 'users',
		description: 'View role list',
	},
	{
		code: 'roles.manage',
		name: 'Manage Roles',
		category: 'users',
		description: 'Create and edit roles',
	},
];

const DEFAULT_ROLES = [
	{
		name: 'admin',
		display_name: 'Administrator',
		description: 'Full system access',
		color: '#ef4444',
		is_system: true,
		permissions: ['*'],
	},
	{
		name: 'manager',
		display_name: 'Manager',
		description: 'Project and client management',
		color: '#f59e0b',
		is_system: true,
		permissions: [
			'projects.*',
			'clients.*',
			'deployments.*',
			'backups.*',
			'servers.view',
		],
	},
	{
		name: 'developer',
		display_name: 'Developer',
		description: 'Development and deployment',
		color: '#3b82f6',
		is_system: true,
		permissions: [
			'projects.view',
			'projects.edit',
			'deployments.*',
			'backups.view',
			'monitoring.view',
		],
	},
	{
		name: 'viewer',
		display_name: 'Viewer',
		description: 'Read-only access',
		color: '#6b7280',
		is_system: true,
		permissions: [
			'projects.view',
			'servers.view',
			'clients.view',
			'deployments.view',
			'backups.view',
			'monitoring.view',
		],
	},
];

@Injectable()
export class RbacService {
	constructor(private readonly prisma: PrismaService) {}

	private normalizeRoles(rows: DbRoleRow[]) {
		const map = new Map<
			number,
			{
				id: number;
				name: string;
				display_name: string;
				description: string | null;
				color: string;
				is_system: boolean;
				permissions: DbPermission[];
			}
		>();

		for (const row of rows) {
			let role = map.get(row.id);
			if (!role) {
				role = {
					id: row.id,
					name: row.name,
					display_name: row.display_name,
					description: row.description,
					color: row.color,
					is_system: row.is_system,
					permissions: [],
				};
				map.set(row.id, role);
			}

			if (
				row.permission_id !== null &&
				row.permission_code &&
				row.permission_name
			) {
				role.permissions.push({
					id: row.permission_id,
					code: row.permission_code,
					name: row.permission_name,
					description: row.permission_description,
					category: row.permission_category,
				});
			}
		}

		return Array.from(map.values());
	}

	private async setRolePermissions(roleId: number, permissionIds: number[]) {
		await this.prisma.$executeRaw`
			DELETE FROM role_permissions
			WHERE role_id = ${roleId}
		`;

		const uniqueIds = Array.from(
			new Set(permissionIds.filter(id => Number.isInteger(id) && id > 0)),
		);

		for (const permissionId of uniqueIds) {
			const permissionRows = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM permissions
				WHERE id = ${permissionId}
				LIMIT 1
			`;
			if (!permissionRows[0]) {
				continue;
			}

			await this.prisma.$executeRaw`
				INSERT INTO role_permissions (role_id, permission_id)
				VALUES (${roleId}, ${permissionId})
			`;
		}
	}

	private async getRoleRows(roleId?: number) {
		if (roleId) {
			return this.prisma.$queryRaw<DbRoleRow[]>`
				SELECT
					r.id,
					r.name,
					r.display_name,
					r.description,
					r.color,
					r.is_system,
					p.id AS permission_id,
					p.code AS permission_code,
					p.name AS permission_name,
					p.description AS permission_description,
					p.category AS permission_category
				FROM roles r
				LEFT JOIN role_permissions rp ON rp.role_id = r.id
				LEFT JOIN permissions p ON p.id = rp.permission_id
				WHERE r.id = ${roleId}
				ORDER BY r.name ASC, p.category ASC NULLS LAST, p.code ASC NULLS LAST
			`;
		}

		return this.prisma.$queryRaw<DbRoleRow[]>`
			SELECT
				r.id,
				r.name,
				r.display_name,
				r.description,
				r.color,
				r.is_system,
				p.id AS permission_id,
				p.code AS permission_code,
				p.name AS permission_name,
				p.description AS permission_description,
				p.category AS permission_category
			FROM roles r
			LEFT JOIN role_permissions rp ON rp.role_id = r.id
			LEFT JOIN permissions p ON p.id = rp.permission_id
			ORDER BY r.name ASC, p.category ASC NULLS LAST, p.code ASC NULLS LAST
		`;
	}

	private expandPermissionPatterns(
		patterns: string[],
		permissions: DbPermission[],
	): number[] {
		if (patterns.includes('*')) {
			return permissions.map(permission => permission.id);
		}

		const result = new Set<number>();
		for (const pattern of patterns) {
			if (pattern.endsWith('.*')) {
				const prefix = pattern.slice(0, -2);
				for (const permission of permissions) {
					if (permission.code.startsWith(`${prefix}.`)) {
						result.add(permission.id);
					}
				}
				continue;
			}

			for (const permission of permissions) {
				if (permission.code === pattern) {
					result.add(permission.id);
				}
			}
		}

		return Array.from(result);
	}

	async listPermissions() {
		return this.prisma.$queryRaw<DbPermission[]>`
			SELECT id, code, name, description, category
			FROM permissions
			ORDER BY category ASC NULLS LAST, code ASC
		`;
	}

	async seedPermissions() {
		let created = 0;

		for (const permission of DEFAULT_PERMISSIONS) {
			const existing = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM permissions
				WHERE code = ${permission.code}
				LIMIT 1
			`;

			if (existing[0]) {
				continue;
			}

			await this.prisma.$executeRaw`
				INSERT INTO permissions (code, name, description, category, created_at, updated_at)
				VALUES (
					${permission.code},
					${permission.name},
					${permission.description},
					${permission.category},
					NOW(),
					NOW()
				)
			`;

			created += 1;
		}

		return { created };
	}

	async listRoles() {
		const rows = await this.getRoleRows();
		return this.normalizeRoles(rows);
	}

	async getRole(roleId: number) {
		const rows = await this.getRoleRows(roleId);
		const roles = this.normalizeRoles(rows);
		const role = roles[0];
		if (!role) {
			throw new NotFoundException({ detail: 'Role not found' });
		}
		return role;
	}

	async createRole(payload: RoleCreateDto) {
		const existingRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM roles
			WHERE name = ${payload.name}
			LIMIT 1
		`;
		if (existingRows[0]) {
			throw new BadRequestException({ detail: 'Role name already exists' });
		}

		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO roles (
				name,
				display_name,
				description,
				color,
				is_system,
				created_at,
				updated_at
			)
			VALUES (
				${payload.name},
				${payload.display_name},
				${payload.description ?? null},
				${payload.color ?? '#6366f1'},
				${false},
				NOW(),
				NOW()
			)
			RETURNING id
		`;

		const roleId = rows[0]?.id;
		if (!roleId) {
			throw new NotFoundException({ detail: 'Failed to create role' });
		}

		if (payload.permission_ids) {
			await this.setRolePermissions(roleId, payload.permission_ids);
		}

		return this.getRole(roleId);
	}

	async updateRole(roleId: number, payload: RoleUpdateDto) {
		const current = await this.getRole(roleId);

		await this.prisma.$executeRaw`
			UPDATE roles
			SET
				display_name = ${payload.display_name ?? current.display_name},
				description = ${payload.description ?? current.description},
				color = ${payload.color ?? current.color},
				updated_at = NOW()
			WHERE id = ${roleId}
		`;

		if (payload.permission_ids) {
			await this.setRolePermissions(roleId, payload.permission_ids);
		}

		return this.getRole(roleId);
	}

	async deleteRole(roleId: number) {
		const roleRows = await this.prisma.$queryRaw<
			{ id: number; is_system: boolean }[]
		>`
			SELECT id, is_system
			FROM roles
			WHERE id = ${roleId}
			LIMIT 1
		`;

		const role = roleRows[0];
		if (!role) {
			throw new NotFoundException({ detail: 'Role not found' });
		}
		if (role.is_system) {
			throw new BadRequestException({ detail: 'Cannot delete system roles' });
		}

		await this.prisma.$executeRaw`
			DELETE FROM roles
			WHERE id = ${roleId}
		`;

		return { success: true };
	}

	async seedRoles() {
		const allPermissions = await this.listPermissions();
		let created = 0;

		for (const role of DEFAULT_ROLES) {
			const existingRows = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM roles
				WHERE name = ${role.name}
				LIMIT 1
			`;
			if (existingRows[0]) {
				continue;
			}

			const insertedRows = await this.prisma.$queryRaw<{ id: number }[]>`
				INSERT INTO roles (
					name,
					display_name,
					description,
					color,
					is_system,
					created_at,
					updated_at
				)
				VALUES (
					${role.name},
					${role.display_name},
					${role.description},
					${role.color},
					${role.is_system},
					NOW(),
					NOW()
				)
				RETURNING id
			`;

			const roleId = insertedRows[0]?.id;
			if (!roleId) {
				continue;
			}

			const permissionIds = this.expandPermissionPatterns(
				role.permissions,
				allPermissions,
			);
			await this.setRolePermissions(roleId, permissionIds);
			created += 1;
		}

		return { created };
	}
}
