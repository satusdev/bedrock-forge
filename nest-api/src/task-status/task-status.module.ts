import { Module } from '@nestjs/common';
import { TaskStatusController } from './task-status.controller';
import { TaskStatusRunnerService } from './task-status.runner.service';
import { TaskStatusService } from './task-status.service';

@Module({
	controllers: [TaskStatusController],
	providers: [TaskStatusService, TaskStatusRunnerService],
	exports: [TaskStatusService],
})
export class TaskStatusModule {}
