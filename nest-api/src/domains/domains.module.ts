import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

@Module({
	imports: [PrismaModule],
	controllers: [DomainsController],
	providers: [DomainsService],
})
export class DomainsModule {}
