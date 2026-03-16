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
import { CreateDomainDto, UpdateDomainDto } from './dto/domain.dto';

@Injectable()
export class DomainsService {
	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.DOMAINS) private readonly queue: Queue,
	) {}

	findAll(query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where = query.search
			? { domain: { contains: query.search, mode: 'insensitive' as const } }
			: {};
		return this.prisma
			.$transaction([
				this.prisma.domain.findMany({
					where,
					skip: (page - 1) * limit,
					take: limit,
					orderBy: { domain: 'asc' },
				}),
				this.prisma.domain.count({ where }),
			])
			.then(([items, total]) => ({ items, total, page, limit }));
	}

	async findOne(id: number) {
		const d = await this.prisma.domain.findUnique({
			where: { id: BigInt(id) },
		});
		if (!d) throw new NotFoundException(`Domain ${id} not found`);
		return d;
	}

	async create(dto: CreateDomainDto) {
		const domain = await this.prisma.domain.create({
			data: { ...dto, environment_id: BigInt(dto.environment_id) },
		});
		// Kick off initial WHOIS lookup
		await this.queue.add(
			JOB_TYPES.DOMAIN_WHOIS,
			{ domainId: Number(domain.id), domain: domain.domain },
			DEFAULT_JOB_OPTIONS,
		);
		return domain;
	}

	async update(id: number, dto: UpdateDomainDto) {
		await this.findOne(id);
		return this.prisma.domain.update({
			where: { id: BigInt(id) },
			data: {
				...dto,
				...(dto.environment_id && {
					environment_id: BigInt(dto.environment_id),
				}),
			},
		});
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.prisma.domain.delete({ where: { id: BigInt(id) } });
	}

	async refreshWhois(id: number) {
		const d = await this.findOne(id);
		const job = await this.queue.add(
			JOB_TYPES.DOMAIN_WHOIS,
			{ domainId: Number(d.id), domain: d.domain },
			DEFAULT_JOB_OPTIONS,
		);
		return { bullJobId: job.id };
	}
}
