import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { CreateBedrockProcessor } from './create-bedrock.processor';
import { EncryptionModule } from '../../encryption/encryption.module';

@Module({
	imports: [
		BullModule.registerQueue({ name: QUEUES.PROJECTS }),
		EncryptionModule,
	],
	providers: [CreateBedrockProcessor],
})
export class CreateBedrockProcessorModule {}
