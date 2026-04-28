import {
	Controller,
	Get,
	HttpException,
	HttpStatus,
	OnModuleInit,
	OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';

@Controller('health')
export class HealthController implements OnModuleInit, OnModuleDestroy {
	private redisClient!: Redis;

	constructor(
		private readonly prisma: PrismaService,
		private readonly config: ConfigService,
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
}
