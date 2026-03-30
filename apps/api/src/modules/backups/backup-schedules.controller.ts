import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	Put,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BackupSchedulesService } from './backup-schedules.service';
import { UpsertBackupScheduleDto } from './dto/backup-schedule.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('environments/:envId/backup-schedule')
export class BackupSchedulesController {
	constructor(private readonly service: BackupSchedulesService) {}

	@Get()
	findOne(@Param('envId', ParseIntPipe) envId: number) {
		return this.service.findByEnvironment(envId);
	}

	/** Create or update the backup schedule for an environment (upsert). */
	@Put()
	upsert(
		@Param('envId', ParseIntPipe) envId: number,
		@Body() dto: UpsertBackupScheduleDto,
	) {
		return this.service.upsert(envId, dto);
	}

	@Delete()
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('envId', ParseIntPipe) envId: number) {
		return this.service.remove(envId);
	}
}
