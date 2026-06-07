import { Module } from '@nestjs/common';
import { RemoteOpsController } from './remote-ops.controller';
import { RemoteOpsService } from './remote-ops.service';
import { ServersModule } from '../servers/servers.module';

@Module({
	imports: [ServersModule],
	controllers: [RemoteOpsController],
	providers: [RemoteOpsService],
})
export class RemoteOpsModule {}
