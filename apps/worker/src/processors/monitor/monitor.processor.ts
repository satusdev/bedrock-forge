import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as https from 'https';
import * as http from 'http';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '@bedrock-forge/shared';

@Processor(QUEUES.MONITORS)
export class MonitorProcessor extends WorkerHost {
	private readonly logger = new Logger(MonitorProcessor.name);

	constructor(private readonly prisma: PrismaService) {
		super();
	}

	async process(job: Job) {
		const { monitorId } = job.data;
		const timeout = 30_000;
		const checkedAt = new Date();
		let statusCode: number | null = null;
		let responseTimeMs: number | null = null;
		let isUp = false;

		const monitor = await this.prisma.monitor.findUnique({
			where: { id: BigInt(monitorId) },
			include: { environment: { select: { url: true } } },
		});
		if (!monitor) return;

		const url = monitor.environment.url;
		const start = Date.now();

		try {
			const result = await this.checkHttp(url, timeout);
			statusCode = result.statusCode;
			responseTimeMs = Date.now() - start;
			isUp = result.statusCode >= 200 && result.statusCode < 400;
		} catch {
			isUp = false;
			responseTimeMs = Date.now() - start;
		}

		await this.prisma.monitorResult.create({
			data: {
				monitor_id: BigInt(monitorId),
				is_up: isUp,
				status_code: statusCode ?? 0,
				response_ms: responseTimeMs ?? 0,
				checked_at: checkedAt,
			},
		});

		// Prune results older than 30 days
		const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		await this.prisma.monitorResult.deleteMany({
			where: { monitor_id: BigInt(monitorId), checked_at: { lt: cutoff } },
		});

		// Update monitor uptime %
		const recentResults = await this.prisma.monitorResult.findMany({
			where: { monitor_id: BigInt(monitorId) },
			select: { is_up: true },
		});
		const upCount = recentResults.filter(r => r.is_up).length;
		const uptime =
			recentResults.length > 0 ? (upCount / recentResults.length) * 100 : 100;

		await this.prisma.monitor.update({
			where: { id: BigInt(monitorId) },
			data: {
				last_checked_at: checkedAt,
				last_status: statusCode,
				last_response_ms: responseTimeMs,
				uptime_pct: uptime,
			},
		});
	}

	private checkHttp(
		url: string,
		timeout: number,
	): Promise<{ statusCode: number; body: string }> {
		return new Promise((resolve, reject) => {
			const mod = url.startsWith('https') ? https : http;
			const chunks: Buffer[] = [];
			const req = mod.get(url, { timeout }, res => {
				res.on('data', (c: Buffer) => chunks.push(c));
				res.on('end', () =>
					resolve({
						statusCode: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString(),
					}),
				);
			});
			req.on('error', reject);
			req.on('timeout', () => {
				req.destroy();
				reject(new Error('Request timed out'));
			});
		});
	}
}
