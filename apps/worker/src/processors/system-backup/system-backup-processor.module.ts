import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { RcloneService } from "../../services/rclone.service";
import { SystemBackupProcessor } from "./system-backup.processor";

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.SYSTEM_BACKUPS })],
  providers: [SystemBackupProcessor, RcloneService],
})
export class SystemBackupProcessorModule {}
