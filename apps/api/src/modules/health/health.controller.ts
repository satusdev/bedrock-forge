import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
	constructor(
		private readonly prisma: PrismaService,
		private readonly config: ConfigService,
	) {}

	@Get()
	async check() {
		const now = new Date().toISOString();

		// Run both checks in parallel
		const [dbResult, redisResult] = await Promise.allSettled([
			this.prisma.$queryRaw`SELECT 1`,
			this.pingRedis(),
		]);

		const db = dbResult.status === 'fulfilled' ? 'ok' : 'error';
		const redis = redisResult.status === 'fulfilled' ? 'ok' : 'error';
		const status = db === 'ok' && redis === 'ok' ? 'ok' : 'degraded';

		const body = { status, db, redis, timestamp: now };

		if (status !== 'ok') {
			throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
		}

		return body;
	}

	private async pingRedis(): Promise<void> {
		const redisUrl =
			this.config.get<string>('redis.url') ?? 'redis://localhost:6379';
		const client = new Redis(redisUrl);
		try {
			await client.ping();
		} finally {
			client.disconnect();
		}
	}
}
