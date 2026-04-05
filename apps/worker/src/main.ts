import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { Logger } from '@nestjs/common';

// Prisma returns BigInt IDs; ensure they serialize properly in any JSON context.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
	return Number(this);
};

process.on('unhandledRejection', (reason: unknown) => {
	console.error('[Worker] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err: Error) => {
	console.error('[Worker] Uncaught exception:', err);
	process.exit(1);
});

async function bootstrap() {
	const app = await NestFactory.createApplicationContext(WorkerModule);
	app.enableShutdownHooks();
	const logger = new Logger('Worker');
	logger.log('Bedrock Forge Worker started');
}

bootstrap().catch(err => {
	console.error('Worker failed to start', err);
	process.exit(1);
});
