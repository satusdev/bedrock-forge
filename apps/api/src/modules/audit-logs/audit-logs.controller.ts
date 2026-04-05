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
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

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
	list(@Query() query: QueryAuditLogDto) {
		return this.svc.list(
			{
				user_id: query.user_id,
				action: query.action,
				resource_type: query.resource_type,
				date_from: query.date_from ? new Date(query.date_from) : undefined,
				date_to: query.date_to ? new Date(query.date_to) : undefined,
			},
			query.page,
			query.limit,
		);
	}

	/** GET /audit-logs/:id */
	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}
}
