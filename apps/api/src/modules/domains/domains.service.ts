import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DomainsRepository } from './domains.repository';
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
		private readonly repo: DomainsRepository,
		@InjectQueue(QUEUES.DOMAINS) private readonly queue: Queue,
	) {}

	findAll(query: PaginationQuery & { projectId?: number }) {
		return this.repo.findAll(query);
	}

	async findOne(id: number) {
		const d = await this.repo.findById(BigInt(id));
		if (!d) throw new NotFoundException(`Domain ${id} not found`);
		return d;
	}

	async create(dto: CreateDomainDto) {
		const domain = await this.repo.create({
			name: dto.name,
			project_id: BigInt(dto.project_id),
		});
		// Kick off initial WHOIS lookup
		await this.queue.add(
			JOB_TYPES.DOMAIN_WHOIS,
			{ domainId: Number(domain.id), domain: domain.name },
			DEFAULT_JOB_OPTIONS,
		);
		return domain;
	}

	/**
	 * Return the existing domain record if the name already exists globally,
	 * otherwise create a new one. Prevents duplicate root domains across projects.
	 */
	async findOrCreate(dto: CreateDomainDto) {
		const existing = await this.repo.findByName(dto.name);
		if (existing) return existing;
		return this.create(dto);
	}

	async update(id: number, dto: UpdateDomainDto) {
		await this.findOne(id);
		return this.repo.update(BigInt(id), {
			...(dto.name && { name: dto.name }),
			...(dto.project_id && { project_id: BigInt(dto.project_id) }),
		});
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.repo.delete(BigInt(id));
	}

	async refreshWhois(id: number) {
		const d = await this.findOne(id);
		const job = await this.queue.add(
			JOB_TYPES.DOMAIN_WHOIS,
			{ domainId: Number(d.id), domain: d.name },
			DEFAULT_JOB_OPTIONS,
		);
		return { bullJobId: job.id };
	}
}
