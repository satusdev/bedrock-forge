import { Throttle } from '@nestjs/throttler';
import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	Query,
	UseGuards,
	HttpCode,
	HttpStatus,
	ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SystemBackupsService } from './system-backups.service';
import { SystemBackupScheduleService } from './system-backup-schedule.service';
import { UpsertSystemBackupScheduleDto } from './system-backup-schedule.dto';

@Controller('system-backups')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class SystemBackupsController {
	constructor(
		private readonly svc: SystemBackupsService,
		private readonly scheduleSvc: SystemBackupScheduleService,
	) {}

	/** List all Forge system backups, newest first. */
	@Get()
	list(@Query() q: PaginationQueryDto) {
		return this.svc.list(q.page ?? 1, q.limit ?? 20);
	}

	// ── Schedule routes (must precede :id to avoid parameter capture) ────────

	/** Get the current system backup schedule (or null). */
	@Get('schedule')
	getSchedule() {
		return this.scheduleSvc.findSchedule();
	}

	/** Create or update the system backup schedule. */
	@Put('schedule')
	upsertSchedule(@Body() dto: UpsertSystemBackupScheduleDto) {
		return this.scheduleSvc.upsert(dto);
	}

	/** Delete the system backup schedule and remove the repeatable job. */
	@Delete('schedule')
	@HttpCode(HttpStatus.NO_CONTENT)
	removeSchedule() {
		return this.scheduleSvc.remove();
	}

	/** Get a single system backup by ID. */
	@Get(':id')
	findOne(@Param('id', ParseIntPipe) id: number) {
		return this.svc.findOne(id);
	}

	/** Trigger a manual Forge DB backup to Google Drive. */
	@Post()
	@HttpCode(HttpStatus.ACCEPTED)
	@Throttle({ default: { ttl: 300_000, limit: 3 } })
	create() {
		return this.svc.enqueueCreate();
	}
}
