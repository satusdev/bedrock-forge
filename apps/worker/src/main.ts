import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { Logger } from '@nestjs/common';
import { sshPoolManager } from '@bedrock-forge/remote-executor';

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

// Drain the SSH connection pool on shutdown so all managed-server connections
// are cleanly closed before the process exits. NestJS's enableShutdownHooks()
// handles BullMQ / Prisma drain; we wire the pool separately since it is a
// standalone singleton outside the IoC container.
const shutdownPool = () => sshPoolManager.destroy();
process.on('SIGTERM', shutdownPool);
process.on('SIGINT', shutdownPool);

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
