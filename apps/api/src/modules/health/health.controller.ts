import {
	Controller,
	Get,
	HttpException,
	HttpStatus,
	OnModuleInit,
	OnModuleDestroy,
	UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES, QUEUES } from '@bedrock-forge/shared';
import Redis from 'ioredis';

@Controller('health')
export class HealthController implements OnModuleInit, OnModuleDestroy {
	private redisClient!: Redis;

	constructor(
		private readonly prisma: PrismaService,
		private readonly config: ConfigService,
		@InjectQueue(QUEUES.BACKUPS) private readonly backupsQueue: Queue,
		@InjectQueue(QUEUES.SECURITY) private readonly securityQueue: Queue,
		@InjectQueue(QUEUES.NOTIFICATIONS)
		private readonly notificationsQueue: Queue,
	) {}

	onModuleInit(): void {
		const url =
			this.config.get<string>('redis.url') ?? 'redis://localhost:6379';
		this.redisClient = new Redis(url, {
			connectTimeout: 4000,
			commandTimeout: 4000,
			maxRetriesPerRequest: 1,
			enableReadyCheck: false,
		});
		// Suppress unhandled-error events; health check uses Promise.allSettled
		this.redisClient.on('error', () => {});
	}

	async onModuleDestroy(): Promise<void> {
		await this.redisClient.quit().catch(() => {});
	}

	/** Public minimal health check — used by load balancers and uptime monitors. */
	@Get()
	async check() {
		const [dbResult, redisResult] = await Promise.allSettled([
			this.prisma.$queryRaw`SELECT 1`,
			this.redisClient.ping(),
		]);

		const db = dbResult.status === 'fulfilled' ? 'ok' : 'error';
		const redis = redisResult.status === 'fulfilled' ? 'ok' : 'error';
		const overall = db === 'ok' && redis === 'ok' ? 'ok' : 'degraded';

		if (overall !== 'ok') {
			throw new HttpException(
				{ status: 'degraded' },
				HttpStatus.SERVICE_UNAVAILABLE,
			);
		}

		return { status: 'ok' };
	}

	/**
	 * Admin-only detailed health report — DB latency, Redis latency, memory,
	 * uptime, Node version, app version, queue depths.  Returns 503 if any
	 * component is unhealthy.
	 */
	@Get('details')
	@Throttle({ default: { ttl: 60_000, limit: 10 } })
	@UseGuards(AuthGuard('jwt'), RolesGuard)
	@Roles(ROLES.ADMIN)
	async details() {
		const t0db = Date.now();
		const [dbResult, redisResult] = await Promise.allSettled([
			this.prisma.$queryRaw`SELECT 1`,
			this.redisClient.ping(),
		]);
		const dbLatencyMs = Date.now() - t0db;

		const t0redis = Date.now();
		const redisPing = await this.redisClient.ping().catch(() => null);
		const redisLatencyMs = Date.now() - t0redis;

		const [backupsCounts, securityCounts, notifCounts] =
			await Promise.allSettled([
				this.backupsQueue.getJobCounts(),
				this.securityQueue.getJobCounts(),
				this.notificationsQueue.getJobCounts(),
			]);

		const mem = process.memoryUsage();

		const db =
			dbResult.status === 'fulfilled'
				? { status: 'ok', latency_ms: dbLatencyMs }
				: {
						status: 'error',
						error:
							dbResult.status === 'rejected'
								? String(dbResult.reason)
								: 'unknown',
					};

		const redis =
			redisResult.status === 'fulfilled'
				? { status: 'ok', latency_ms: redisLatencyMs }
				: {
						status: 'error',
						latency_ms: redisLatencyMs,
						error:
							redisResult.status === 'rejected'
								? String(redisResult.reason)
								: 'unknown',
					};

		const overall =
			db.status === 'ok' && redis.status === 'ok' ? 'ok' : 'degraded';

		const payload = {
			status: overall,
			timestamp: new Date().toISOString(),
			uptime_s: Math.floor(process.uptime()),
			node_version: process.version,
			app_version: process.env.npm_package_version ?? 'unknown',
			components: { db, redis: { ...redis, ping: redisPing } },
			memory: {
				rss_mb: Math.round(mem.rss / 1024 / 1024),
				heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
				heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
				external_mb: Math.round(mem.external / 1024 / 1024),
			},
			queues: {
				backups:
					backupsCounts.status === 'fulfilled' ? backupsCounts.value : null,
				security:
					securityCounts.status === 'fulfilled' ? securityCounts.value : null,
				notifications:
					notifCounts.status === 'fulfilled' ? notifCounts.value : null,
			},
		};

		if (overall !== 'ok') {
			throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
		}

		return payload;
	}
}
