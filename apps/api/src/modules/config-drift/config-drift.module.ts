import { Module } from '@nestjs/common';
import { ConfigDriftController } from './config-drift.controller';
import { ConfigDriftService } from './config-drift.service';
import { ConfigDriftRepository } from './config-drift.repository';

@Module({
	controllers: [ConfigDriftController],
	providers: [ConfigDriftService, ConfigDriftRepository],
})
export class ConfigDriftModule {}
