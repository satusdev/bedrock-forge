import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.REPORTS })],
	controllers: [ReportsController],
	providers: [ReportsService],
})
export class ReportsModule {}
