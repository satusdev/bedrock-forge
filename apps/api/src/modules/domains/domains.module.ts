import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { DomainsRepository } from './domains.repository';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.DOMAINS })],
	controllers: [DomainsController],
	providers: [DomainsService, DomainsRepository],
	exports: [DomainsService],
})
export class DomainsModule {}
