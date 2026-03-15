import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpCode,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { ScheduleCreateDto } from './dto/schedule-create.dto';
import { ScheduleUpdateDto } from './dto/schedule-update.dto';
import { SchedulesService } from './schedules.service';

@Controller('schedules')
export class SchedulesController {
	constructor(
		private readonly schedulesService: SchedulesService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	private parseOptionalInteger(
		value: string | undefined,
		fieldName: string,
	): number | undefined {
		if (typeof value === 'undefined') {
			return undefined;
		}

		const parsed = Number(value);
		if (!Number.isInteger(parsed) || parsed < 1) {
			throw new BadRequestException({ detail: `Invalid ${fieldName}` });
		}

		return parsed;
	}

	@Get()
	async getSchedules(
		@Query('project_id') projectId?: string,
		@Query('status') status?: string,
		@Query('page') page?: string,
		@Query('page_size') pageSize?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		const parsedProjectId = this.parseOptionalInteger(projectId, 'project_id');
		const parsedPage = this.parseOptionalInteger(page, 'page');
		const parsedPageSize = this.parseOptionalInteger(pageSize, 'page_size');
		return this.schedulesService.listSchedules({
			project_id: parsedProjectId,
			status: status?.trim() || undefined,
			page: parsedPage,
			page_size: parsedPageSize,
			owner_id: ownerId,
		});
	}

	@Get(':scheduleId')
	async getSchedule(
		@Param('scheduleId', ParseIntPipe) scheduleId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.schedulesService.getSchedule(scheduleId, ownerId);
	}

	@Post()
	async createSchedule(
		@Body() payload: ScheduleCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.schedulesService.createSchedule(payload, ownerId);
	}

	@Patch(':scheduleId')
	async updateSchedule(
		@Param('scheduleId', ParseIntPipe) scheduleId: number,
		@Body() payload: ScheduleUpdateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.schedulesService.updateSchedule(scheduleId, payload, ownerId);
	}

	@Delete(':scheduleId')
	@HttpCode(204)
	async deleteSchedule(
		@Param('scheduleId', ParseIntPipe) scheduleId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		await this.schedulesService.deleteSchedule(scheduleId, ownerId);
	}

	@Post(':scheduleId/pause')
	async pauseSchedule(
		@Param('scheduleId', ParseIntPipe) scheduleId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.schedulesService.pauseSchedule(scheduleId, ownerId);
	}

	@Post(':scheduleId/resume')
	async resumeSchedule(
		@Param('scheduleId', ParseIntPipe) scheduleId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.schedulesService.resumeSchedule(scheduleId, ownerId);
	}

	@Post(':scheduleId/run')
	async runScheduleNow(
		@Param('scheduleId', ParseIntPipe) scheduleId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.schedulesService.runScheduleNow(scheduleId, ownerId);
	}
}
