import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [ServersController],
	providers: [ServersService],
})
export class ServersModule {}
