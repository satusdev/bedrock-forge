import {
	IsInt,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
	MinLength,
} from 'class-validator';

export class ScheduleCreateDto {
	@IsString()
	@MinLength(1)
	@MaxLength(255)
	name!: string;

	@IsInt()
	@Min(1)
	project_id!: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	environment_id?: number;

	@IsOptional()
	@IsString()
	frequency?: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(23)
	hour?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(59)
	minute?: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(6)
	day_of_week?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(31)
	day_of_month?: number;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	timezone?: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	cron_expression?: string;

	@IsOptional()
	@IsString()
	backup_type?: string;

	@IsOptional()
	@IsString()
	storage_type?: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	retention_count?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	retention_days?: number;

	@IsOptional()
	@IsString()
	description?: string;
}
