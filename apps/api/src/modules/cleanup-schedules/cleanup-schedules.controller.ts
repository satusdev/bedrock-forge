import {
	Controller,
	Get,
	Put,
	Delete,
	Param,
	Body,
	ParseIntPipe,
	UseGuards,
	HttpCode,
	HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { CleanupSchedulesService } from './cleanup-schedules.service';
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
	Min,
	Max,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpsertCleanupScheduleDto {
	@IsOptional()
	@IsBoolean()
	enabled?: boolean;

	@IsOptional()
	@IsString()
	frequency?: string;

	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@Min(0)
	@Max(23)
	hour?: number;

	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@Min(0)
	@Max(59)
	minute?: number;

	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@Min(0)
	@Max(6)
	day_of_week?: number | null;

	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@Min(1)
	@Max(28)
	day_of_month?: number | null;

	@IsOptional()
	@IsInt()
	@Type(() => Number)
	@Min(0)
	@Max(100)
	keep_revisions?: number;
}

@Controller('environments/:envId/cleanup-schedule')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.MANAGER)
export class CleanupSchedulesController {
	constructor(private readonly svc: CleanupSchedulesService) {}

	@Get()
	findOne(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.findByEnvironment(envId);
	}

	@Put()
	upsert(
		@Param('envId', ParseIntPipe) envId: number,
		@Body() dto: UpsertCleanupScheduleDto,
	) {
		return this.svc.upsert(envId, dto);
	}

	@Delete()
	@HttpCode(HttpStatus.NO_CONTENT)
	remove(@Param('envId', ParseIntPipe) envId: number) {
		return this.svc.delete(envId);
	}
}
