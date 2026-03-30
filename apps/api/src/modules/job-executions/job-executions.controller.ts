import {
	Controller,
	Get,
	Param,
	ParseIntPipe,
	Query,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JobExecutionsService } from './job-executions.service';

@Controller('job-executions')
@UseGuards(AuthGuard('jwt'))
export class JobExecutionsController {
	constructor(private readonly svc: JobExecutionsService) {}

	/** GET /job-executions?page=1&limit=25&queue_name=backups&status=failed&environment_id=3 */
	@Get()
	list(
		@Query('page') page?: string,
		@Query('limit') limit?: string,
		@Query('queue_name') queue_name?: string,
		@Query('status') status?: string,
		@Query('environment_id') environment_id?: string,
		@Query('date_from') date_from?: string,
		@Query('date_to') date_to?: string,
	) {
		return this.svc.list(
			{
				queue_name: queue_name || undefined,
				status: status || undefined,
				environment_id: environment_id ? Number(environment_id) : undefined,
				date_from: date_from ? new Date(date_from) : undefined,
				date_to: date_to ? new Date(date_to) : undefined,
			},
			Number(page ?? 1),
			Math.min(Number(limit ?? 25), 100),
		);
	}

	/** GET /job-executions/:id — full record with environment/project/client */
	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}

	/** GET /job-executions/:id/log — id, status, execution_log only (used for polling) */
	@Get(':id/log')
	findLog(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findLog(id);
	}
}
