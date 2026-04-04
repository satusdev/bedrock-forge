import {
	Controller,
	Get,
	Param,
	ParseIntPipe,
	Query,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class AuditLogsController {
	constructor(private readonly svc: AuditLogsService) {}

	/**
	 * GET /audit-logs?page=1&limit=25&user_id=3&action=backup.create&resource_type=backup&date_from=...&date_to=...
	 * Admin-only: full audit trail of all user-initiated mutations.
	 */
	@Get()
	list(
		@Query('page') page?: string,
		@Query('limit') limit?: string,
		@Query('user_id') user_id?: string,
		@Query('action') action?: string,
		@Query('resource_type') resource_type?: string,
		@Query('date_from') date_from?: string,
		@Query('date_to') date_to?: string,
	) {
		return this.svc.list(
			{
				user_id: user_id ? Number(user_id) : undefined,
				action: action || undefined,
				resource_type: resource_type || undefined,
				date_from: date_from ? new Date(date_from) : undefined,
				date_to: date_to ? new Date(date_to) : undefined,
			},
			Number(page ?? 1),
			Math.min(Number(limit ?? 25), 100),
		);
	}

	/** GET /audit-logs/:id */
	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}
}
