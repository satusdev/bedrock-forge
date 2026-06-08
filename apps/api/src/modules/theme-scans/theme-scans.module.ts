import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { ThemeScansController } from "./theme-scans.controller";
import { ThemeScansService } from "./theme-scans.service";
import { ThemeScansRepository } from "./theme-scans.repository";
import { JobExecutionsModule } from "../job-executions/job-executions.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.THEME_SCANS }),
    JobExecutionsModule,
  ],
  controllers: [ThemeScansController],
  providers: [ThemeScansService, ThemeScansRepository],
})
export class ThemeScansModule {}
