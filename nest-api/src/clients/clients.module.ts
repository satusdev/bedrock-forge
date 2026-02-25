import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
	imports: [PrismaModule],
	controllers: [ClientsController],
	providers: [ClientsService],
})
export class ClientsModule {}
