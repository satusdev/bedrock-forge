import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MaintenanceService } from "./maintenance.service";
import { MaintenanceRepository } from "./maintenance.repository";
import { CleanupSchedulesModule } from "../cleanup-schedules/cleanup-schedules.module";
import { WpActionsModule } from "../wp-actions/wp-actions.module";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";

@Module({
  imports: [
    PrismaModule,
    CleanupSchedulesModule,
    WpActionsModule,
    BullModule.registerQueue(
      { name: QUEUES.MONITORS },
      { name: QUEUES.BACKUPS },
      { name: QUEUES.PLUGIN_UPDATES },
    ),
  ],
  providers: [MaintenanceService, MaintenanceRepository],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
