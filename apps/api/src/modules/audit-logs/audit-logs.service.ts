import { Injectable } from '@nestjs/common';
import { AuditLogsRepository } from './audit-logs.repository';

@Injectable()
export class AuditLogsService {
	constructor(private readonly repo: AuditLogsRepository) {}

	async list(
		filter: {
			user_id?: number;
			action?: string;
			resource_type?: string;
			date_from?: Date;
			date_to?: Date;
		},
		page: number,
		limit: number,
	) {
		const { data, total } = await this.repo.findAll(filter, page, limit);
		return {
			data,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}

	findOne(id: number) {
		return this.repo.findById(id);
	}
}
