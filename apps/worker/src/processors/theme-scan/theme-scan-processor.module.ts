import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { ThemeScanProcessor } from "./theme-scan.processor";

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.THEME_SCANS })],
  providers: [ThemeScanProcessor],
})
export class ThemeScanProcessorModule {}
