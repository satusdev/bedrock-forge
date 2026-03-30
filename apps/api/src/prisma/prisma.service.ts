import {
	Injectable,
	OnModuleInit,
	OnModuleDestroy,
	Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(PrismaService.name);

	constructor() {
		const pool = new pg.Pool({
			connectionString: process.env.DATABASE_URL ?? '',
		});
		const adapter = new PrismaPg(pool as any);
		super({
			adapter,
			log: [
				{ emit: 'event', level: 'query' },
				{ emit: 'stdout', level: 'error' },
				{ emit: 'stdout', level: 'warn' },
			],
		});
	}

	async onModuleInit() {
		await this.$connect();
		this.logger.log('Database connected');
	}

	async onModuleDestroy() {
		await this.$disconnect();
		this.logger.log('Database disconnected');
	}
}
