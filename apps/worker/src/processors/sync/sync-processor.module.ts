import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { SyncProcessor } from "./sync.processor";
import { RcloneService } from "../../services/rclone.service";
import { LayoutDetectorService } from "./services/layout-detector.service";
import { ProtectedCptService } from "./services/protected-cpt.service";
import { SyncDbService } from "./services/sync-db.service";
import { SyncFilesService } from "./services/sync-files.service";

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.SYNC })],
  providers: [
    SyncProcessor,
    RcloneService,
    LayoutDetectorService,
    ProtectedCptService,
    SyncDbService,
    SyncFilesService,
  ],
})
export class SyncProcessorModule {}
