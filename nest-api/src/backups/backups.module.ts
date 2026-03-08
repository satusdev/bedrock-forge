import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { BackupsController } from './backups.controller';
import { BackupsRunnerService } from './backups.runner.service';
import { BackupsService } from './backups.service';

@Module({
	imports: [PrismaModule, AuthModule, WebsocketModule],
	controllers: [BackupsController],
	providers: [BackupsService, BackupsRunnerService],
	exports: [BackupsService],
})
export class BackupsModule {}
