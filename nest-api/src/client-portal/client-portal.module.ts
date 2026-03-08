import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';

@Module({
	imports: [PrismaModule],
	controllers: [ClientPortalController],
	providers: [ClientPortalService],
})
export class ClientPortalModule {}
