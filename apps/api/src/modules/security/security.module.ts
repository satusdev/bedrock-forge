import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { SecurityRepository } from './security.repository';
import { SettingsModule } from '../settings/settings.module';
import { VulnerabilityDbService } from './vulnerability-db.service';

@Module({
	imports: [
		BullModule.registerQueue({ name: QUEUES.SECURITY }),
		BullModule.registerQueue({ name: QUEUES.REPORTS }),
		BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS }),
		SettingsModule,
	],
	controllers: [SecurityController],
	providers: [SecurityService, SecurityRepository, VulnerabilityDbService],
	exports: [SecurityService, VulnerabilityDbService],
})
export class SecurityModule {}
