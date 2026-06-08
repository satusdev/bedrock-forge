import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { ReportsRepository } from "./reports.repository";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.REPORTS }), SettingsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
  exports: [ReportsService],
})
export class ReportsModule {}
