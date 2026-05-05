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
	Logger.error('Unhandled promise rejection', String(reason), 'Worker');
});

process.on('uncaughtException', (err: Error) => {
	Logger.error('Uncaught exception', err.stack, 'Worker');
	process.exit(1);
});

// Drain the SSH connection pool on shutdown so all managed-server connections
// are cleanly closed before the process exits. NestJS's app.close() handles
// BullMQ / Prisma drain; we combine both into one explicit shutdown handler
// so the process awaits full cleanup before exiting.
async function bootstrap() {
	const app = await NestFactory.createApplicationContext(WorkerModule);
	const logger = new Logger('Worker');

	const handleShutdown = async (signal: string) => {
		logger.log(`Received ${signal}, shutting down…`);
		sshPoolManager.destroy();
		await app.close();
		process.exit(0);
	};

	process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
	process.on('SIGINT', () => void handleShutdown('SIGINT'));

	logger.log('Bedrock Forge Worker started');
}

bootstrap().catch(err => {
	console.error('Worker failed to start', err);
	process.exit(1);
});
