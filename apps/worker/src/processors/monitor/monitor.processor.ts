import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as https from 'https';
import * as http from 'http';
import * as tls from 'tls';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '@bedrock-forge/shared';

@Processor(QUEUES.MONITORS)
export class MonitorProcessor extends WorkerHost {
	private readonly logger = new Logger(MonitorProcessor.name);

	constructor(private readonly prisma: PrismaService) {
		super();
	}

	async process(job: Job) {
		const { monitorId, url, type, keyword, timeoutSeconds } = job.data;
		const timeout = (timeoutSeconds ?? 30) * 1000;
		const checkedAt = new Date();
		let statusCode: number | null = null;
		let responseTimeMs: number | null = null;
		let isUp = false;
		let errorMessage: string | null = null;
		let sslExpiresAt: Date | null = null;

		const start = Date.now();

		try {
			if (type === 'ssl') {
				const result = await this.checkSsl(url, timeout);
				isUp = result.valid;
				sslExpiresAt = result.expiresAt;
				responseTimeMs = Date.now() - start;
			} else {
				const result = await this.checkHttp(url, timeout);
				statusCode = result.statusCode;
				responseTimeMs = Date.now() - start;
				isUp = result.statusCode >= 200 && result.statusCode < 400;

				if (type === 'keyword' && keyword) {
					isUp = isUp && result.body.includes(keyword);
				}
			}
		} catch (err: unknown) {
			isUp = false;
			errorMessage = err instanceof Error ? err.message : String(err);
			responseTimeMs = Date.now() - start;
		}

		const monitor = await this.prisma.monitor.findUnique({
			where: { id: BigInt(monitorId) },
		});
		if (!monitor) return;

		await this.prisma.monitorResult.create({
			data: {
				monitor_id: BigInt(monitorId),
				is_up: isUp,
				status_code: statusCode,
				response_time_ms: responseTimeMs,
				error_message: errorMessage,
				ssl_expires_at: sslExpiresAt,
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
				last_is_up: isUp,
				uptime_percentage: uptime,
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

	private checkSsl(
		url: string,
		timeout: number,
	): Promise<{ valid: boolean; expiresAt: Date }> {
		return new Promise((resolve, reject) => {
			const parsed = new URL(url);
			const socket = tls.connect(
				{
					host: parsed.hostname,
					port: 443,
					rejectUnauthorized: false,
					timeout,
				},
				() => {
					const cert = socket.getPeerCertificate();
					socket.destroy();
					if (!cert?.valid_to)
						return resolve({ valid: false, expiresAt: new Date() });
					const expiresAt = new Date(cert.valid_to);
					resolve({ valid: expiresAt > new Date(), expiresAt });
				},
			);
			socket.on('error', reject);
			socket.on('timeout', () => {
				socket.destroy();
				reject(new Error('SSL check timed out'));
			});
		});
	}
}
