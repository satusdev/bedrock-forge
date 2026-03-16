import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import { CreateMonitorDto, UpdateMonitorDto } from './dto/monitor.dto';

@Injectable()
export class MonitorsService {
	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.MONITORS) private readonly queue: Queue,
	) {}

	findAll() {
		return this.prisma.monitor.findMany({
			orderBy: { name: 'asc' },
			include: {
				environment: { select: { id: true, name: true, domain: true } },
			},
		});
	}

	async findOne(id: number) {
		const m = await this.prisma.monitor.findUnique({
			where: { id: BigInt(id) },
			include: {
				monitor_results: { orderBy: { checked_at: 'desc' }, take: 100 },
			},
		});
		if (!m) throw new NotFoundException(`Monitor ${id} not found`);
		return m;
	}

	async create(dto: CreateMonitorDto) {
		const monitor = await this.prisma.monitor.create({
			data: {
				...dto,
				environment_id: BigInt(dto.environment_id),
				type: dto.type as never,
				is_active: true,
			},
		});
		await this.registerRepeatable(monitor);
		return monitor;
	}

	async update(id: number, dto: UpdateMonitorDto) {
		const existing = await this.findOne(id);
		await this.unregisterRepeatable(existing);
		const monitor = await this.prisma.monitor.update({
			where: { id: BigInt(id) },
			data: { ...dto, type: dto.type as never },
		});
		if (monitor.is_active) await this.registerRepeatable(monitor);
		return monitor;
	}

	async remove(id: number) {
		const monitor = await this.findOne(id);
		await this.unregisterRepeatable(monitor);
		return this.prisma.monitor.delete({ where: { id: BigInt(id) } });
	}

	async toggle(id: number, active: boolean) {
		const monitor = await this.findOne(id);
		if (active) {
			await this.registerRepeatable(monitor);
		} else {
			await this.unregisterRepeatable(monitor);
		}
		return this.prisma.monitor.update({
			where: { id: BigInt(id) },
			data: { is_active: active },
		});
	}

	private async registerRepeatable(monitor: {
		id: bigint;
		url: string;
		type: string;
		interval_seconds: number;
		keyword?: string | null;
		timeout_seconds?: number | null;
	}) {
		await this.queue.add(
			JOB_TYPES.MONITOR_CHECK,
			{
				monitorId: Number(monitor.id),
				url: monitor.url,
				type: monitor.type,
				keyword: monitor.keyword,
				timeoutSeconds: monitor.timeout_seconds,
			},
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
