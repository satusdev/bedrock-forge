import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

// Express JSON.stringify cannot handle BigInt (Prisma autoincrement IDs).
// Convert BigInt → Number; IDs never exceed Number.MAX_SAFE_INTEGER here.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
	return Number(this);
};

// ── Pre-flight: fail fast on missing production secrets ──────────────────────
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
	const required: [string, string][] = [
		['JWT_SECRET', process.env.JWT_SECRET ?? ''],
		['JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET ?? ''],
		['ENCRYPTION_KEY', process.env.ENCRYPTION_KEY ?? ''],
		['CORS_ORIGIN', process.env.CORS_ORIGIN ?? ''],
	];
	const missing = required.filter(([, v]) => !v).map(([k]) => k);
	if (missing.length > 0) {
		console.error(
			`[Bootstrap] FATAL: Missing required environment variables in production: ${missing.join(', ')}`,
		);
		process.exit(1);
	}
}

async function bootstrap() {
	const logger = new Logger('Bootstrap');
	const app = await NestFactory.create(AppModule, {
		logger: ['error', 'warn', 'log', 'debug'],
	});

	// Global validation pipe — whitelist + forbid unknown + auto-transform
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
			transformOptions: { enableImplicitConversion: true },
		}),
	);

	// Global API prefix — all routes under /api
	// Health is excluded so Docker/k8s/LB probes resolve at /health (no prefix)
	app.setGlobalPrefix('api', { exclude: ['health'] });

	// Security headers
	app.use(helmet());

	// CORS — in production, CORS_ORIGIN must be set (validated above)
	app.enableCors({
		origin: process.env.CORS_ORIGIN ?? '*',
		credentials: true,
	});

	// Graceful shutdown — lets Prisma/BullMQ finish in-flight work on SIGTERM
	app.enableShutdownHooks();

	const port = parseInt(process.env.API_PORT ?? '3000', 10);
	await app.listen(port);
	logger.log(`Bedrock Forge API running on port ${port}`);
}

bootstrap().catch(err => {
	console.error('Fatal bootstrap error:', err);
	process.exit(1);
});
