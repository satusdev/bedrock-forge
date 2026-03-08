import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncRunnerService } from './sync.runner.service';
import { SyncService } from './sync.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TaskStatusModule } from '../task-status/task-status.module';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [PrismaModule, TaskStatusModule, AuthModule],
	controllers: [SyncController],
	providers: [SyncService, SyncRunnerService],
})
export class SyncModule {}
