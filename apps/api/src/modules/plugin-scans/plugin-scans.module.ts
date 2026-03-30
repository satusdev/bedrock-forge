import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { PluginScansController } from './plugin-scans.controller';
import { PluginScansService } from './plugin-scans.service';
import { PluginScansRepository } from './plugin-scans.repository';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.PLUGIN_SCANS })],
	controllers: [PluginScansController],
	providers: [PluginScansService, PluginScansRepository],
})
export class PluginScansModule {}
