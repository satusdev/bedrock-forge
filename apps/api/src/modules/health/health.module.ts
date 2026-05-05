import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { HealthController } from './health.controller';

@Module({
	imports: [
		BullModule.registerQueue(
			{ name: QUEUES.BACKUPS },
			{ name: QUEUES.SECURITY },
			{ name: QUEUES.NOTIFICATIONS },
		),
	],
	controllers: [HealthController],
})
export class HealthModule {}
