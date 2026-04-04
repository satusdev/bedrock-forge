import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MonitorsRepository } from './monitors.repository';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import { CreateMonitorDto, UpdateMonitorDto } from './dto/monitor.dto';

export interface PaginationQuery {
	page?: number;
	limit?: number;
}

@Injectable()
export class MonitorsService {
	constructor(
		private readonly repo: MonitorsRepository,
		@InjectQueue(QUEUES.MONITORS) private readonly queue: Queue,
	) {}

	findAll() {
		return this.repo.findAll();
	}

	async findOne(id: number) {
		const m = await this.repo.findById(BigInt(id));
		if (!m) throw new NotFoundException(`Monitor ${id} not found`);
		return m;
	}

	async create(dto: CreateMonitorDto) {
		const monitor = await this.repo.create({
			environment_id: BigInt(dto.environment_id),
			interval_seconds: dto.interval_seconds,
			...(dto.enabled !== undefined && { enabled: dto.enabled }),
		});
		await this.registerRepeatable(monitor);
		return monitor;
	}

	async update(id: number, dto: UpdateMonitorDto) {
		const existing = await this.findOne(id);
		await this.unregisterRepeatable(existing);
		const monitor = await this.repo.update(BigInt(id), {
			...(dto.interval_seconds !== undefined && {
				interval_seconds: dto.interval_seconds,
			}),
			...(dto.enabled !== undefined && { enabled: dto.enabled }),
		});
		if (monitor.enabled) await this.registerRepeatable(monitor);
		return monitor;
	}

	async remove(id: number) {
		const monitor = await this.findOne(id);
		await this.unregisterRepeatable(monitor);
		return this.repo.delete(BigInt(id));
	}

	async findLogs(id: number, query: PaginationQuery) {
		const page = Math.max(1, query.page ?? 1);
		const limit = Math.min(100, Math.max(1, query.limit ?? 50));
		const skip = (page - 1) * limit;
		const [items, total] = await Promise.all([
			this.repo.findLogs(BigInt(id), { skip, take: limit }),
			this.repo.countLogs(BigInt(id)),
		]);
		return { items, total, page, limit };
	}

	async findResults(id: number, query: PaginationQuery) {
		const page = Math.max(1, query.page ?? 1);
		const limit = Math.min(200, Math.max(1, query.limit ?? 100));
		const skip = (page - 1) * limit;
		const [items, total] = await Promise.all([
			this.repo.findResults(BigInt(id), { skip, take: limit }),
			this.repo.countResults(BigInt(id)),
		]);
		return { items, total, page, limit };
	}

	async toggle(id: number, active: boolean) {
		const monitor = await this.findOne(id);
		if (active) {
			await this.registerRepeatable(monitor);
		} else {
			await this.unregisterRepeatable(monitor);
		}
		return this.repo.update(BigInt(id), { enabled: active });
	}

	private async registerRepeatable(monitor: {
		id: bigint;
		interval_seconds: number;
	}) {
		await this.queue.add(
			JOB_TYPES.MONITOR_CHECK,
			{ monitorId: Number(monitor.id) },
			{
				...DEFAULT_JOB_OPTIONS,
				jobId: `monitor-${monitor.id}`,
				repeat: { every: monitor.interval_seconds * 1000 },
			},
		);
	}

	private async unregisterRepeatable(monitor: {
		id: bigint;
		interval_seconds: number;
	}) {
		await this.queue.removeRepeatable(JOB_TYPES.MONITOR_CHECK, {
			every: monitor.interval_seconds * 1000,
			jobId: `monitor-${monitor.id}`,
		});
	}
}
