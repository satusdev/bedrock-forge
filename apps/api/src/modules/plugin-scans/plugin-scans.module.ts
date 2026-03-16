import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { PluginScansController } from './plugin-scans.controller';
import { PluginScansService } from './plugin-scans.service';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.PLUGIN_SCANS })],
	controllers: [PluginScansController],
	providers: [PluginScansService],
})
export class PluginScansModule {}
