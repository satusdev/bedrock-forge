import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { CreateBedrockProcessor } from './create-bedrock.processor';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.PROJECTS })],
	providers: [CreateBedrockProcessor],
})
export class CreateBedrockProcessorModule {}
