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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { PluginUpdateSchedulesService } from './plugin-update-schedules.service';
import { UpsertPluginUpdateScheduleDto } from './dto/plugin-update-schedule.dto';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
@Controller('environments/:envId/plugin-update-schedule')
export class PluginUpdateSchedulesController {
	constructor(private readonly svc: PluginUpdateSchedulesService) {}

	@Get()
	findOne(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.findByEnvironment(envId);
	}

	/** Create or update the plugin auto-update schedule (upsert). */
	@Put()
	upsert(
		@Param('envId', ParseIntPipe) envId: number,
		@Body() dto: UpsertPluginUpdateScheduleDto,
	) {
		return this.svc.upsert(envId, dto);
	}

	@Delete()
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.remove(envId);
	}
}
