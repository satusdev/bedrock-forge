import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MaintenanceWindowsService } from "./maintenance-windows.service";
import { MaintenanceWindowsRepository } from "./maintenance-windows.repository";
import { MaintenanceWindowsController } from "./maintenance-windows.controller";

@Module({
  imports: [PrismaModule],
  controllers: [MaintenanceWindowsController],
  providers: [MaintenanceWindowsService, MaintenanceWindowsRepository],
  exports: [MaintenanceWindowsService],
})
export class MaintenanceWindowsModule {}
