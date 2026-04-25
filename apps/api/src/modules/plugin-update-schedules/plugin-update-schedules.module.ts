import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { PluginUpdateSchedulesController } from './plugin-update-schedules.controller';
import { PluginUpdateSchedulesService } from './plugin-update-schedules.service';
import { PluginUpdateSchedulesRepository } from './plugin-update-schedules.repository';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.PLUGIN_UPDATES })],
	controllers: [PluginUpdateSchedulesController],
	providers: [PluginUpdateSchedulesService, PluginUpdateSchedulesRepository],
	exports: [PluginUpdateSchedulesService],
})
export class PluginUpdateSchedulesModule {}
