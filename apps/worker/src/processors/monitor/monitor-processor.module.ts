import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { MonitorProcessor } from './monitor.processor';

@Module({
	imports: [
		BullModule.registerQueue(
			{ name: QUEUES.MONITORS },
			{ name: QUEUES.NOTIFICATIONS },
		),
	],
	providers: [MonitorProcessor],
})
export class MonitorProcessorModule {}
