import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.BACKUPS },
      { name: QUEUES.PLUGIN_SCANS },
      { name: QUEUES.PLUGIN_UPDATES },
      { name: QUEUES.CUSTOM_PLUGINS },
      { name: QUEUES.THEME_SCANS },
      { name: QUEUES.SYNC },
      { name: QUEUES.MONITORS },
      { name: QUEUES.DOMAINS },
      { name: QUEUES.PROJECTS },
      { name: QUEUES.SECURITY },
      { name: QUEUES.NOTIFICATIONS },
      { name: QUEUES.REPORTS },
      { name: QUEUES.WP_ACTIONS },
      { name: QUEUES.SYSTEM_BACKUPS },
    ),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
