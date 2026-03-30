import { Injectable } from '@nestjs/common';
import {
	JobExecutionsRepository,
	JobExecutionFilter,
} from './job-executions.repository';

@Injectable()
export class JobExecutionsService {
	constructor(private readonly repo: JobExecutionsRepository) {}

	list(filter: JobExecutionFilter, page: number, limit: number) {
		return this.repo.findPaginated(filter, page, limit);
	}

	findOne(id: number) {
		return this.repo.findById(id);
	}

	findLog(id: number) {
		return this.repo.findLog(id);
	}
}
