import { Module } from '@nestjs/common';
import { EnvironmentsController } from './environments.controller';
import { EnvironmentsListController } from './environments-list.controller';
import { EnvironmentsService } from './environments.service';
import { EnvironmentsRepository } from './environments.repository';
import { ServersModule } from '../servers/servers.module';
import { MonitorsModule } from '../monitors/monitors.module';
import { DomainsModule } from '../domains/domains.module';

@Module({
	imports: [ServersModule, MonitorsModule, DomainsModule],
	controllers: [EnvironmentsController, EnvironmentsListController],
	providers: [EnvironmentsService, EnvironmentsRepository],
	exports: [EnvironmentsService],
})
export class EnvironmentsModule {}
