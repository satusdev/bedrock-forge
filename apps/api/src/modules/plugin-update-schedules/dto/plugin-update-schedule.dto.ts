import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpsertPluginUpdateScheduleDto {
	@IsBoolean()
	enabled!: boolean;

	@IsIn(['daily', 'weekly', 'monthly'])
	frequency!: string;

	@IsInt()
	@Min(0)
	@Max(23)
	hour!: number;

	@IsInt()
	@Min(0)
	@Max(59)
	minute!: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(6)
	day_of_week?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(28)
	day_of_month?: number;
}
