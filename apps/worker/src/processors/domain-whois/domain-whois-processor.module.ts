import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { DomainWhoisProcessor } from './domain-whois.processor';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.DOMAINS })],
	providers: [DomainWhoisProcessor],
})
export class DomainWhoisProcessorModule {}
