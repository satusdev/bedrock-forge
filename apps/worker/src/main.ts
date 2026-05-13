import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { Logger } from '@nestjs/common';
import { sshPoolManager } from '@bedrock-forge/remote-executor';
import { createServer, type Server } from 'http';

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
	const startedAt = new Date();
	let healthServer: Server | null = null;

	const healthPort = parseInt(process.env.WORKER_HEALTH_PORT ?? '3001', 10);
	if (!Number.isNaN(healthPort) && healthPort > 0) {
		healthServer = createServer((req, res) => {
			if (req.url !== '/health' && req.url !== '/worker/health') {
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ status: 'not_found' }));
				return;
			}

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					status: 'ok',
					service: 'worker',
					startedAt: startedAt.toISOString(),
					uptimeSeconds: Math.round(process.uptime()),
				}),
			);
		});
		healthServer.listen(healthPort, () => {
			logger.log(`Worker health endpoint listening on port ${healthPort}`);
		});
	}

	const handleShutdown = async (signal: string) => {
		logger.log(`Received ${signal}, shutting down…`);
		sshPoolManager.destroy();
		if (healthServer) {
			await new Promise<void>(resolve => healthServer?.close(() => resolve()));
		}
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
