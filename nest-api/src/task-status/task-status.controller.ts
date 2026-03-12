import {
	Body,
	Controller,
	Get,
	Headers,
	Param,
	Put,
	UnauthorizedException,
} from '@nestjs/common';
import { UpsertTaskStatusDto } from './dto/upsert-task-status.dto';
import { TaskStatusService } from './task-status.service';

@Controller('internal/tasks')
export class TaskStatusController {
	constructor(private readonly taskStatusService: TaskStatusService) {}

	private authorizeWorker(headers: Record<string, string | undefined>) {
		const expectedToken = process.env.NEST_WORKER_TOKEN;
		if (!expectedToken) {
			return;
		}
		const providedToken = headers['x-worker-token'];
		if (providedToken !== expectedToken) {
			throw new UnauthorizedException({ detail: 'Invalid worker token' });
		}
	}

	@Get(':taskId')
	async getTaskStatus(
		@Param('taskId') taskId: string,
		@Headers() headers: Record<string, string | undefined>,
	) {
		this.authorizeWorker(headers);
		return this.taskStatusService.getTaskStatus(taskId, {
			status: 'pending',
			message: 'Task is queued',
			progress: 0,
		});
	}

	@Put(':taskId')
	async upsertTaskStatus(
		@Param('taskId') taskId: string,
		@Headers() headers: Record<string, string | undefined>,
		@Body() payload: UpsertTaskStatusDto,
	) {
		this.authorizeWorker(headers);
		return this.taskStatusService.upsertTaskStatus(taskId, payload);
	}
}
