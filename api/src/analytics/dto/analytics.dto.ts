import {
	IsDateString,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from 'class-validator';

export class Ga4RunRequestDto {
	@IsInt()
	@Min(1)
	project_id!: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	environment_id?: number;

	@IsOptional()
	@IsString()
	property_id?: string;

	@IsOptional()
	@IsString()
	credentials_path?: string;

	@IsOptional()
	@IsDateString()
	start_date?: string;

	@IsOptional()
	@IsDateString()
	end_date?: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(365)
	days?: number;
}

export class LighthouseRunRequestDto {
	@IsInt()
	@Min(1)
	project_id!: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	environment_id?: number;

	@IsOptional()
	@IsString()
	url?: string;

	@IsOptional()
	@IsIn(['desktop', 'mobile'])
	device?: 'desktop' | 'mobile';
}

export class AnalyticsReportsQueryDto {
	@IsInt()
	@Min(1)
	project_id!: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	environment_id?: number;

	@IsOptional()
	@IsIn(['ga4', 'lighthouse'])
	report_type?: 'ga4' | 'lighthouse';

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number;
}
