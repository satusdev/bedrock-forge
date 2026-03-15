import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DomainsController } from './domains.controller';
import { DomainsRunnerService } from './domains.runner.service';
import { DomainsService } from './domains.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [DomainsController],
	providers: [DomainsService, DomainsRunnerService],
})
export class DomainsModule {}
