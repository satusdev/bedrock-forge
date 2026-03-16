import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { Logger } from '@nestjs/common';

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
