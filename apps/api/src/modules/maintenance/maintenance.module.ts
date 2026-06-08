import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MaintenanceService } from "./maintenance.service";
import { MaintenanceRepository } from "./maintenance.repository";
import { CleanupSchedulesModule } from "../cleanup-schedules/cleanup-schedules.module";
import { WpActionsModule } from "../wp-actions/wp-actions.module";

@Module({
  imports: [PrismaModule, CleanupSchedulesModule, WpActionsModule],
  providers: [MaintenanceService, MaintenanceRepository],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
