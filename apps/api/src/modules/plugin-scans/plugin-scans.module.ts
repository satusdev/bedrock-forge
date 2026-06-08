import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { PluginScansController } from "./plugin-scans.controller";
import { PluginScansService } from "./plugin-scans.service";
import { PluginScansRepository } from "./plugin-scans.repository";
import { CustomPluginsModule } from "../custom-plugins/custom-plugins.module";
import { JobExecutionsModule } from "../job-executions/job-executions.module";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.PLUGIN_SCANS },
      { name: QUEUES.CUSTOM_PLUGINS },
    ),
    CustomPluginsModule,
    JobExecutionsModule,
  ],
  controllers: [PluginScansController],
  providers: [PluginScansService, PluginScansRepository],
})
export class PluginScansModule {}
