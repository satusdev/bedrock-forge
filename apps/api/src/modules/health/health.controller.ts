import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
	constructor(private readonly prisma: PrismaService) {}

	@Get()
	async check() {
		try {
			await this.prisma.$queryRaw`SELECT 1`;
			return { status: 'ok', db: 'ok', timestamp: new Date().toISOString() };
		} catch (err) {
			return {
				status: 'degraded',
				db: 'error',
				timestamp: new Date().toISOString(),
			};
		}
	}
}
