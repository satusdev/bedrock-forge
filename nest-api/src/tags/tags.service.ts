import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TagAssignmentDto, TagCreateDto, TagUpdateDto } from './dto/tag.dto';

type DbTag = {
	id: number;
	name: string;
	slug: string;
	color: string;
	icon: string | null;
	description: string | null;
	usage_count: number;
	created_at: Date;
	updated_at: Date;
};

const DEFAULT_TAGS = [
	{
		name: 'WordPress',
		slug: 'wordpress',
		color: '#21759b',
		icon: 'Globe',
		description: 'WordPress-based projects',
	},
	{
		name: 'E-commerce',
		slug: 'ecommerce',
		color: '#7c3aed',
		icon: 'ShoppingCart',
		description: 'Online store projects',
	},
	{
		name: 'Client Site',
		slug: 'client-site',
		color: '#059669',
		icon: 'Users',
		description: 'External client projects',
	},
	{
		name: 'Internal',
		slug: 'internal',
		color: '#6366f1',
		icon: 'Building',
		description: 'Internal company projects',
	},
	{
		name: 'Customers',
		slug: 'customers',
		color: '#0ea5e9',
		icon: 'Briefcase',
		description: 'Customer-facing projects',
	},
	{
		name: 'Staging',
		slug: 'staging',
		color: '#f59e0b',
		icon: 'FlaskConical',
		description: 'Testing and staging environments',
	},
	{
		name: 'Development',
		slug: 'development',
		color: '#8b5cf6',
		icon: 'Code',
		description: 'Active development projects',
	},
	{
		name: 'Production',
		slug: 'production',
		color: '#10b981',
		icon: 'Rocket',
		description: 'Live production sites',
	},
	{
		name: 'In Progress',
		slug: 'in-progress',
		color: '#f97316',
		icon: 'Clock',
		description: 'Projects currently being worked on',
	},
	{
		name: 'Archive',
		slug: 'archive',
		color: '#6b7280',
		icon: 'Archive',
		description: 'Archived or inactive projects',
	},
	{
		name: 'High Priority',
		slug: 'high-priority',
		color: '#ef4444',
		icon: 'AlertTriangle',
		description: 'Urgent priority projects',
	},
	{
		name: 'Maintenance',
		slug: 'maintenance',
		color: '#14b8a6',
		icon: 'Zap',
		description: 'Projects under maintenance',
	},
];

@Injectable()
export class TagsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private slugify(value: string): string {
		return value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	}

	private async ensureTagExists(tagId: number) {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM tags
			WHERE id = ${tagId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Tag not found' });
		}
	}

	private async ensureProjectExists(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
	}

	private async ensureClientExists(clientId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM clients
			WHERE id = ${clientId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Client not found' });
		}
	}

	private async ensureServerExists(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM servers
			WHERE id = ${serverId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Server not found' });
		}
	}

	private async recalculateUsageCounts() {
		await this.prisma.$executeRaw`
			UPDATE tags t
			SET
				usage_count =
					COALESCE((SELECT COUNT(*)::int FROM project_tags pt WHERE pt.tag_id = t.id), 0)
					+ COALESCE((SELECT COUNT(*)::int FROM server_tags st WHERE st.tag_id = t.id), 0)
					+ COALESCE((SELECT COUNT(*)::int FROM client_tags ct WHERE ct.tag_id = t.id), 0),
				updated_at = NOW()
		`;
	}

	private async resolveTagIds(tagIds: number[]): Promise<number[]> {
		const uniqueIds = Array.from(
			new Set(tagIds.filter(tagId => Number.isInteger(tagId) && tagId > 0)),
		);

		const validIds: number[] = [];
		for (const tagId of uniqueIds) {
			const rows = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM tags
				WHERE id = ${tagId}
				LIMIT 1
			`;
			if (rows[0]) {
				validIds.push(tagId);
			}
		}

		return validIds;
	}

	private async getLinkedTags(
		entity: 'project' | 'client' | 'server',
		id: number,
		ownerId?: number,
	) {
		if (entity === 'project') {
			await this.ensureProjectExists(id, ownerId);
			return this.prisma.$queryRaw<DbTag[]>`
				SELECT t.id, t.name, t.slug, t.color, t.icon, t.description, t.usage_count, t.created_at, t.updated_at
				FROM tags t
				INNER JOIN project_tags pt ON pt.tag_id = t.id
				WHERE pt.project_id = ${id}
				ORDER BY t.name ASC
			`;
		}

		if (entity === 'client') {
			await this.ensureClientExists(id, ownerId);
			return this.prisma.$queryRaw<DbTag[]>`
				SELECT t.id, t.name, t.slug, t.color, t.icon, t.description, t.usage_count, t.created_at, t.updated_at
				FROM tags t
				INNER JOIN client_tags ct ON ct.tag_id = t.id
				WHERE ct.client_id = ${id}
				ORDER BY t.name ASC
			`;
		}

		await this.ensureServerExists(id, ownerId);
		return this.prisma.$queryRaw<DbTag[]>`
			SELECT t.id, t.name, t.slug, t.color, t.icon, t.description, t.usage_count, t.created_at, t.updated_at
			FROM tags t
			INNER JOIN server_tags st ON st.tag_id = t.id
			WHERE st.server_id = ${id}
			ORDER BY t.name ASC
		`;
	}

	async listTags(search?: string) {
		const searchTerm = search ? `%${search}%` : null;
		return this.prisma.$queryRaw<DbTag[]>`
			SELECT id, name, slug, color, icon, description, usage_count, created_at, updated_at
			FROM tags
			WHERE (${searchTerm}::text IS NULL OR name ILIKE ${searchTerm})
			ORDER BY name ASC
		`;
	}

	async getTag(tagId: number) {
		const rows = await this.prisma.$queryRaw<DbTag[]>`
			SELECT id, name, slug, color, icon, description, usage_count, created_at, updated_at
			FROM tags
			WHERE id = ${tagId}
			LIMIT 1
		`;

		const tag = rows[0];
		if (!tag) {
			throw new NotFoundException({ detail: 'Tag not found' });
		}

		return tag;
	}

	async createTag(payload: TagCreateDto) {
		const slug = payload.slug
			? this.slugify(payload.slug)
			: this.slugify(payload.name);
		if (!slug) {
			throw new BadRequestException({ detail: 'Tag slug cannot be empty' });
		}

		const existingRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM tags
			WHERE name = ${payload.name} OR slug = ${slug}
			LIMIT 1
		`;
		if (existingRows[0]) {
			throw new BadRequestException({ detail: 'Tag already exists' });
		}

		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO tags (name, slug, color, icon, description, usage_count, created_at, updated_at)
			VALUES (
				${payload.name},
				${slug},
				${payload.color ?? '#6366f1'},
				${payload.icon ?? null},
				${payload.description ?? null},
				${0},
				NOW(),
				NOW()
			)
			RETURNING id
		`;

		const tagId = rows[0]?.id;
		if (!tagId) {
			throw new NotFoundException({ detail: 'Failed to create tag' });
		}

		return this.getTag(tagId);
	}

	async updateTag(tagId: number, payload: TagUpdateDto) {
		const current = await this.getTag(tagId);

		const nextName = payload.name ?? current.name;
		const nextSlug =
			typeof payload.slug === 'string'
				? this.slugify(payload.slug)
				: payload.name
					? this.slugify(payload.name)
					: current.slug;

		if (!nextSlug) {
			throw new BadRequestException({ detail: 'Tag slug cannot be empty' });
		}

		const duplicateRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM tags
			WHERE (name = ${nextName} OR slug = ${nextSlug}) AND id <> ${tagId}
			LIMIT 1
		`;
		if (duplicateRows[0]) {
			throw new BadRequestException({ detail: 'Tag already exists' });
		}

		await this.prisma.$executeRaw`
			UPDATE tags
			SET
				name = ${nextName},
				slug = ${nextSlug},
				color = ${payload.color ?? current.color},
				icon = ${payload.icon ?? current.icon},
				description = ${payload.description ?? current.description},
				updated_at = NOW()
			WHERE id = ${tagId}
		`;

		return this.getTag(tagId);
	}

	async deleteTag(tagId: number) {
		await this.ensureTagExists(tagId);
		await this.prisma.$executeRaw`
			DELETE FROM tags
			WHERE id = ${tagId}
		`;
		return { success: true };
	}

	async seedTags() {
		let created = 0;
		for (const tag of DEFAULT_TAGS) {
			const rows = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM tags
				WHERE slug = ${tag.slug}
				LIMIT 1
			`;
			if (rows[0]) {
				continue;
			}

			await this.prisma.$executeRaw`
				INSERT INTO tags (name, slug, color, icon, description, usage_count, created_at, updated_at)
				VALUES (
					${tag.name},
					${tag.slug},
					${tag.color},
					${tag.icon},
					${tag.description},
					${0},
					NOW(),
					NOW()
				)
			`;
			created += 1;
		}

		await this.recalculateUsageCounts();
		return { created };
	}

	async getProjectTags(projectId: number, ownerId?: number) {
		return this.getLinkedTags('project', projectId, ownerId);
	}

	async setProjectTags(
		projectId: number,
		payload: TagAssignmentDto,
		ownerId?: number,
	) {
		await this.ensureProjectExists(projectId, ownerId);
		const tagIds = await this.resolveTagIds(payload.tag_ids);

		await this.prisma.$executeRaw`
			DELETE FROM project_tags
			WHERE project_id = ${projectId}
		`;

		for (const tagId of tagIds) {
			await this.prisma.$executeRaw`
				INSERT INTO project_tags (project_id, tag_id)
				VALUES (${projectId}, ${tagId})
			`;
		}

		await this.recalculateUsageCounts();
		return { success: true, tags: tagIds };
	}

	async addProjectTag(projectId: number, tagId: number, ownerId?: number) {
		await this.ensureProjectExists(projectId, ownerId);
		await this.ensureTagExists(tagId);

		const rows = await this.prisma.$queryRaw<{ tag_id: number }[]>`
			SELECT tag_id
			FROM project_tags
			WHERE project_id = ${projectId} AND tag_id = ${tagId}
			LIMIT 1
		`;
		if (!rows[0]) {
			await this.prisma.$executeRaw`
				INSERT INTO project_tags (project_id, tag_id)
				VALUES (${projectId}, ${tagId})
			`;
			await this.recalculateUsageCounts();
		}

		return { success: true };
	}

	async removeProjectTag(projectId: number, tagId: number, ownerId?: number) {
		await this.ensureProjectExists(projectId, ownerId);
		await this.ensureTagExists(tagId);

		await this.prisma.$executeRaw`
			DELETE FROM project_tags
			WHERE project_id = ${projectId} AND tag_id = ${tagId}
		`;
		await this.recalculateUsageCounts();
		return { success: true };
	}

	async getClientTags(clientId: number, ownerId?: number) {
		return this.getLinkedTags('client', clientId, ownerId);
	}

	async setClientTags(
		clientId: number,
		payload: TagAssignmentDto,
		ownerId?: number,
	) {
		await this.ensureClientExists(clientId, ownerId);
		const tagIds = await this.resolveTagIds(payload.tag_ids);

		await this.prisma.$executeRaw`
			DELETE FROM client_tags
			WHERE client_id = ${clientId}
		`;

		for (const tagId of tagIds) {
			await this.prisma.$executeRaw`
				INSERT INTO client_tags (client_id, tag_id)
				VALUES (${clientId}, ${tagId})
			`;
		}

		await this.recalculateUsageCounts();
		return { success: true, tags: tagIds };
	}

	async addClientTag(clientId: number, tagId: number, ownerId?: number) {
		await this.ensureClientExists(clientId, ownerId);
		await this.ensureTagExists(tagId);

		const rows = await this.prisma.$queryRaw<{ tag_id: number }[]>`
			SELECT tag_id
			FROM client_tags
			WHERE client_id = ${clientId} AND tag_id = ${tagId}
			LIMIT 1
		`;
		if (!rows[0]) {
			await this.prisma.$executeRaw`
				INSERT INTO client_tags (client_id, tag_id)
				VALUES (${clientId}, ${tagId})
			`;
			await this.recalculateUsageCounts();
		}

		return { success: true };
	}

	async removeClientTag(clientId: number, tagId: number, ownerId?: number) {
		await this.ensureClientExists(clientId, ownerId);
		await this.ensureTagExists(tagId);

		await this.prisma.$executeRaw`
			DELETE FROM client_tags
			WHERE client_id = ${clientId} AND tag_id = ${tagId}
		`;
		await this.recalculateUsageCounts();
		return { success: true };
	}

	async getServerTags(serverId: number, ownerId?: number) {
		return this.getLinkedTags('server', serverId, ownerId);
	}

	async setServerTags(
		serverId: number,
		payload: TagAssignmentDto,
		ownerId?: number,
	) {
		await this.ensureServerExists(serverId, ownerId);
		const tagIds = await this.resolveTagIds(payload.tag_ids);

		await this.prisma.$executeRaw`
			DELETE FROM server_tags
			WHERE server_id = ${serverId}
		`;

		for (const tagId of tagIds) {
			await this.prisma.$executeRaw`
				INSERT INTO server_tags (server_id, tag_id)
				VALUES (${serverId}, ${tagId})
			`;
		}

		await this.recalculateUsageCounts();
		return { success: true, tags: tagIds };
	}
}
