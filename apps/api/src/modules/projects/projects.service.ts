import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
	QUEUES,
	JOB_TYPES,
	DEFAULT_JOB_OPTIONS,
	PaginationQuery,
} from '@bedrock-forge/shared';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.PROJECTS) private readonly projectsQueue: Queue,
	) {}

	findAll(query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const skip = (page - 1) * limit;
		const where = query.search
			? { name: { contains: query.search, mode: 'insensitive' as const } }
			: {};
		return this.prisma
			.$transaction([
				this.prisma.project.findMany({
					where,
					skip,
					take: limit,
					include: {
						client: true,
						server: { select: { id: true, name: true, ip_address: true } },
					},
					orderBy: { name: 'asc' },
				}),
				this.prisma.project.count({ where }),
			])
			.then(([items, total]) => ({ items, total, page, limit }));
	}

	async findOne(id: number) {
		const p = await this.prisma.project.findUnique({
			where: { id: BigInt(id) },
			include: {
				client: true,
				server: { select: { id: true, name: true } },
				environments: true,
			},
		});
		if (!p) throw new NotFoundException(`Project ${id} not found`);
		return p;
	}

	async create(dto: CreateProjectDto) {
		const project = await this.prisma.project.create({
			data: {
				name: dto.name,
				client_id: BigInt(dto.client_id),
				server_id: BigInt(dto.server_id),
				hosting_package_id: dto.hosting_package_id
					? BigInt(dto.hosting_package_id)
					: undefined,
				support_package_id: dto.support_package_id
					? BigInt(dto.support_package_id)
					: undefined,
				notes: dto.notes,
			},
			include: { client: true },
		});
		return project;
	}

	async update(id: number, dto: UpdateProjectDto) {
		await this.findOne(id);
		return this.prisma.project.update({
			where: { id: BigInt(id) },
			data: {
				...dto,
				...(dto.client_id && { client_id: BigInt(dto.client_id) }),
				...(dto.server_id && { server_id: BigInt(dto.server_id) }),
				...(dto.hosting_package_id && {
					hosting_package_id: BigInt(dto.hosting_package_id),
				}),
				...(dto.support_package_id && {
					support_package_id: BigInt(dto.support_package_id),
				}),
			},
		});
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.prisma.project.delete({ where: { id: BigInt(id) } });
	}

	async createBedrock(environmentId: number, jobExecutionId: bigint) {
		return this.projectsQueue.add(
			JOB_TYPES.PROJECT_CREATE_BEDROCK,
			{ environmentId, jobExecutionId: Number(jobExecutionId) },
			DEFAULT_JOB_OPTIONS,
		);
	}
}
