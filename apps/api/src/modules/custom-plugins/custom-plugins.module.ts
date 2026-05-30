import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { CustomPluginsController } from './custom-plugins.controller';
import { CustomPluginsService } from './custom-plugins.service';
import { CustomPluginsRepository } from './custom-plugins.repository';
import { GithubService } from './github.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
	imports: [
		SettingsModule,
		BullModule.registerQueue({ name: QUEUES.CUSTOM_PLUGINS }),
	],
	controllers: [CustomPluginsController],
	providers: [CustomPluginsService, CustomPluginsRepository, GithubService],
	exports: [CustomPluginsService, GithubService, CustomPluginsRepository],
})
export class CustomPluginsModule {}
