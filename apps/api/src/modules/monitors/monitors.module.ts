import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';
import { MonitorsRepository } from './monitors.repository';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.MONITORS })],
	controllers: [MonitorsController],
	providers: [MonitorsService, MonitorsRepository],
	exports: [MonitorsService],
})
export class MonitorsModule {}
