import { Module } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { ServersRepository } from './servers.repository';
import { SettingsModule } from '../settings/settings.module';

@Module({
	imports: [SettingsModule],
	controllers: [ServersController],
	providers: [ServersService, ServersRepository],
	exports: [ServersService],
})
export class ServersModule {}
