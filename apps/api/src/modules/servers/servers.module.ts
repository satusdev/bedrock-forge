import { Module } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { ServersRepository } from './servers.repository';

@Module({
	controllers: [ServersController],
	providers: [ServersService, ServersRepository],
	exports: [ServersService],
})
export class ServersModule {}
