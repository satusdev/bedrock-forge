import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export interface ReportScheduleConfig {
	enabled: boolean;
	day_of_week: number;
	hour: number;
	minute: number;
}

export class UpdateReportScheduleDto {
	@IsBoolean()
	enabled!: boolean;

	/** 0 = Sunday, 1 = Monday … 6 = Saturday */
	@IsInt()
	@Min(0)
	@Max(6)
	day_of_week!: number;

	@IsInt()
	@Min(0)
	@Max(23)
	hour!: number;

	@IsInt()
	@Min(0)
	@Max(59)
	minute!: number;
}
