import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { EncryptionModule } from '../../common/encryption/encryption.module';
import { DomainsModule } from '../domains/domains.module';
import { MonitorsModule } from '../monitors/monitors.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';

@Module({
	imports: [
		BullModule.registerQueue({ name: QUEUES.PROJECTS }),
		EncryptionModule,
		DomainsModule,
		MonitorsModule,
	],
	controllers: [ProjectsController],
	providers: [ProjectsRepository, ProjectsService],
	exports: [ProjectsService],
})
export class ProjectsModule {}
