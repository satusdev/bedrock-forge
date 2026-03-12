import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TaskStatusController } from './task-status.controller';
import { TaskStatusRunnerService } from './task-status.runner.service';
import { TaskStatusService } from './task-status.service';

@Module({
	imports: [PrismaModule],
	controllers: [TaskStatusController],
	providers: [TaskStatusService, TaskStatusRunnerService],
	exports: [TaskStatusService],
})
export class TaskStatusModule {}
