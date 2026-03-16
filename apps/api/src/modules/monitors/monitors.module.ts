import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.MONITORS })],
	controllers: [MonitorsController],
	providers: [MonitorsService],
})
export class MonitorsModule {}
