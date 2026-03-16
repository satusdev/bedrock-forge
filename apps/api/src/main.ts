import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

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
	app.setGlobalPrefix('api');

	// CORS — in production, restrict to your domain
	app.enableCors({
		origin: process.env.CORS_ORIGIN ?? '*',
		credentials: true,
	});

	const port = parseInt(process.env.API_PORT ?? '3000', 10);
	await app.listen(port);
	logger.log(`Bedrock Forge API running on port ${port}`);
}

bootstrap().catch(err => {
	console.error('Fatal bootstrap error:', err);
	process.exit(1);
});
