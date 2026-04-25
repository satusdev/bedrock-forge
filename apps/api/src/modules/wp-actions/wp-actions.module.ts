import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { WpActionsController } from './wp-actions.controller';
import { WpActionsService } from './wp-actions.service';
import { WpActionsRepository } from './wp-actions.repository';
import { ServersModule } from '../servers/servers.module';

@Module({
	imports: [
		BullModule.registerQueue({ name: QUEUES.WP_ACTIONS }),
		ServersModule,
	],
	controllers: [WpActionsController],
	providers: [WpActionsService, WpActionsRepository],
})
export class WpActionsModule {}
