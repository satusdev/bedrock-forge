import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MaintenanceService } from './maintenance.service';

@Module({
	imports: [PrismaModule],
	providers: [MaintenanceService],
})
export class MaintenanceModule {}
