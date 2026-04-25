import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { WpActionsProcessor } from './wp-actions.processor';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.WP_ACTIONS })],
	providers: [WpActionsProcessor],
})
export class WpActionsProcessorModule {}
