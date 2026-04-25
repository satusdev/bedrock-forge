import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { CustomPluginProcessor } from './custom-plugin.processor';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.CUSTOM_PLUGINS })],
	providers: [CustomPluginProcessor],
})
export class CustomPluginProcessorModule {}
