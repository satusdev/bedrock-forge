import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { LighthouseController } from './lighthouse.controller';
import { LighthouseRepository } from './lighthouse.repository';
import { LighthouseService } from './lighthouse.service';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.MONITORS })],
	controllers: [LighthouseController],
	providers: [LighthouseRepository, LighthouseService],
})
export class LighthouseModule {}

