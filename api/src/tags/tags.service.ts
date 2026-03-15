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
		const tag = await this.prisma.tags.findUnique({
			where: { id: tagId },
			select: { id: true },
		});
		if (!tag) {
			throw new NotFoundException({ detail: 'Tag not found' });
		}
	}

	private async ensureProjectExists(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: resolvedOwnerId,
			},
			select: { id: true },
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
	}

	private async ensureClientExists(clientId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const client = await this.prisma.clients.findFirst({
			where: {
				id: clientId,
				owner_id: resolvedOwnerId,
			},
			select: { id: true },
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}
	}

	private async ensureServerExists(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const server = await this.prisma.servers.findFirst({
			where: {
				id: serverId,
				owner_id: resolvedOwnerId,
			},
			select: { id: true },
		});
		if (!server) {
			throw new NotFoundException({ detail: 'Server not found' });
		}
	}

	private async recalculateUsageCounts() {
		const tags = await this.prisma.tags.findMany({
			select: {
				id: true,
				_count: {
					select: {
						project_tags: true,
						server_tags: true,
						client_tags: true,
					},
				},
			},
		});

		if (tags.length === 0) {
			return;
		}

		await this.prisma.$transaction(
			tags.map(tag =>
				this.prisma.tags.update({
					where: { id: tag.id },
					data: {
						usage_count:
							tag._count.project_tags +
							tag._count.server_tags +
							tag._count.client_tags,
						updated_at: new Date(),
					},
				}),
			),
		);
	}

	private async resolveTagIds(tagIds: number[]): Promise<number[]> {
		const uniqueIds = Array.from(
			new Set(tagIds.filter(tagId => Number.isInteger(tagId) && tagId > 0)),
		);
		if (uniqueIds.length === 0) {
			return [];
		}

		const rows = await this.prisma.tags.findMany({
			where: {
				id: { in: uniqueIds },
			},
			select: { id: true },
		});

		return rows.map(row => row.id);
	}

	private async getLinkedTags(
		entity: 'project' | 'client' | 'server',
		id: number,
		ownerId?: number,
	) {
		if (entity === 'project') {
			await this.ensureProjectExists(id, ownerId);
			return this.prisma.tags.findMany({
				where: {
					project_tags: {
						some: {
							project_id: id,
						},
					},
				},
				orderBy: { name: 'asc' },
			}) as Promise<DbTag[]>;
		}

		if (entity === 'client') {
			await this.ensureClientExists(id, ownerId);
			return this.prisma.tags.findMany({
				where: {
					client_tags: {
						some: {
							client_id: id,
						},
					},
				},
				orderBy: { name: 'asc' },
			}) as Promise<DbTag[]>;
		}

		await this.ensureServerExists(id, ownerId);
		return this.prisma.tags.findMany({
			where: {
				server_tags: {
					some: {
						server_id: id,
					},
				},
			},
			orderBy: { name: 'asc' },
		}) as Promise<DbTag[]>;
	}

	async listTags(search?: string) {
		return this.prisma.tags.findMany({
			where: search
				? {
						name: {
							contains: search,
							mode: 'insensitive',
						},
					}
				: undefined,
			orderBy: { name: 'asc' },
		}) as Promise<DbTag[]>;
	}

	async getTag(tagId: number) {
		const tag = await this.prisma.tags.findUnique({
			where: { id: tagId },
		});
		if (!tag) {
			throw new NotFoundException({ detail: 'Tag not found' });
		}

		return tag as DbTag;
	}

	async createTag(payload: TagCreateDto) {
		const slug = payload.slug
			? this.slugify(payload.slug)
			: this.slugify(payload.name);
		if (!slug) {
			throw new BadRequestException({ detail: 'Tag slug cannot be empty' });
		}

		const existing = await this.prisma.tags.findFirst({
			where: {
				OR: [{ name: payload.name }, { slug }],
			},
			select: { id: true },
		});
		if (existing) {
			throw new BadRequestException({ detail: 'Tag already exists' });
		}

		const created = await this.prisma.tags.create({
			data: {
				name: payload.name,
				slug,
				color: payload.color ?? '#6366f1',
				icon: payload.icon ?? null,
				description: payload.description ?? null,
				usage_count: 0,
				created_at: new Date(),
				updated_at: new Date(),
			},
			select: { id: true },
		});

		const tagId = created.id;
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

		const duplicate = await this.prisma.tags.findFirst({
			where: {
				id: { not: tagId },
				OR: [{ name: nextName }, { slug: nextSlug }],
			},
			select: { id: true },
		});
		if (duplicate) {
			throw new BadRequestException({ detail: 'Tag already exists' });
		}

		await this.prisma.tags.update({
			where: { id: tagId },
			data: {
				name: nextName,
				slug: nextSlug,
				color: payload.color ?? current.color,
				icon: payload.icon ?? current.icon,
				description: payload.description ?? current.description,
				updated_at: new Date(),
			},
		});

		return this.getTag(tagId);
	}

	async deleteTag(tagId: number) {
		await this.ensureTagExists(tagId);
		await this.prisma.tags.delete({ where: { id: tagId } });
		return { success: true };
	}

	async seedTags() {
		let created = 0;
		for (const tag of DEFAULT_TAGS) {
			const existing = await this.prisma.tags.findUnique({
				where: { slug: tag.slug },
				select: { id: true },
			});
			if (existing) {
				continue;
			}

			await this.prisma.tags.create({
				data: {
					name: tag.name,
					slug: tag.slug,
					color: tag.color,
					icon: tag.icon,
					description: tag.description,
					usage_count: 0,
					created_at: new Date(),
					updated_at: new Date(),
				},
			});
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

		await this.prisma.project_tags.deleteMany({
			where: { project_id: projectId },
		});

		if (tagIds.length > 0) {
			await this.prisma.project_tags.createMany({
				data: tagIds.map(tagId => ({ project_id: projectId, tag_id: tagId })),
				skipDuplicates: true,
			});
		}

		await this.recalculateUsageCounts();
		return { success: true, tags: tagIds };
	}

	async addProjectTag(projectId: number, tagId: number, ownerId?: number) {
		await this.ensureProjectExists(projectId, ownerId);
		await this.ensureTagExists(tagId);

		await this.prisma.project_tags.createMany({
			data: [{ project_id: projectId, tag_id: tagId }],
			skipDuplicates: true,
		});
		await this.recalculateUsageCounts();

		return { success: true };
	}

	async removeProjectTag(projectId: number, tagId: number, ownerId?: number) {
		await this.ensureProjectExists(projectId, ownerId);
		await this.ensureTagExists(tagId);

		await this.prisma.project_tags.deleteMany({
			where: {
				project_id: projectId,
				tag_id: tagId,
			},
		});
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

		await this.prisma.client_tags.deleteMany({
			where: { client_id: clientId },
		});

		if (tagIds.length > 0) {
			await this.prisma.client_tags.createMany({
				data: tagIds.map(tagId => ({ client_id: clientId, tag_id: tagId })),
				skipDuplicates: true,
			});
		}

		await this.recalculateUsageCounts();
		return { success: true, tags: tagIds };
	}

	async addClientTag(clientId: number, tagId: number, ownerId?: number) {
		await this.ensureClientExists(clientId, ownerId);
		await this.ensureTagExists(tagId);

		await this.prisma.client_tags.createMany({
			data: [{ client_id: clientId, tag_id: tagId }],
			skipDuplicates: true,
		});
		await this.recalculateUsageCounts();

		return { success: true };
	}

	async removeClientTag(clientId: number, tagId: number, ownerId?: number) {
		await this.ensureClientExists(clientId, ownerId);
		await this.ensureTagExists(tagId);

		await this.prisma.client_tags.deleteMany({
			where: {
				client_id: clientId,
				tag_id: tagId,
			},
		});
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

		await this.prisma.server_tags.deleteMany({
			where: { server_id: serverId },
		});

		if (tagIds.length > 0) {
			await this.prisma.server_tags.createMany({
				data: tagIds.map(tagId => ({ server_id: serverId, tag_id: tagId })),
				skipDuplicates: true,
			});
		}

		await this.recalculateUsageCounts();
		return { success: true, tags: tagIds };
	}
}
