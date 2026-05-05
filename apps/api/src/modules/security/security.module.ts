import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { SecurityRepository } from './security.repository';
import { SettingsModule } from '../settings/settings.module';

@Module({
	imports: [
		BullModule.registerQueue({ name: QUEUES.SECURITY }),
		BullModule.registerQueue({ name: QUEUES.REPORTS }),
		SettingsModule,
	],
	controllers: [SecurityController],
	providers: [SecurityService, SecurityRepository],
	exports: [SecurityService],
})
export class SecurityModule {}
