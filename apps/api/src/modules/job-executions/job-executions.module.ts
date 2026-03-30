import { Module } from '@nestjs/common';
import { JobExecutionsController } from './job-executions.controller';
import { JobExecutionsService } from './job-executions.service';
import { JobExecutionsRepository } from './job-executions.repository';

@Module({
	controllers: [JobExecutionsController],
	providers: [JobExecutionsService, JobExecutionsRepository],
	exports: [JobExecutionsService],
})
export class JobExecutionsModule {}
