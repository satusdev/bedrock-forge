import {
	IsArray,
	IsBoolean,
	IsIn,
	IsInt,
	IsOptional,
	Max,
	Min,
} from 'class-validator';

export interface ReportScheduleConfig {
	enabled: boolean;
	day_of_week: number;
	hour: number;
	minute: number;
	period?: ReportPeriod;
}

export type ReportPeriod =
	| 'last_7d'
	| 'last_30d'
	| 'last_90d'
	| 'this_month'
	| 'last_month';

export const REPORT_PERIODS: ReportPeriod[] = [
	'last_7d',
	'last_30d',
	'last_90d',
	'this_month',
	'last_month',
];

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

	@IsOptional()
	@IsIn(REPORT_PERIODS)
	period?: ReportPeriod;
}

export class ToggleChannelSubscriptionDto {
	@IsBoolean()
	subscribed!: boolean;
}

export class GenerateReportDto {
	/** Optional: channel IDs to target. Omit → send to all subscribed channels. */
	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	channelIds?: number[];

	/** Time window for the report. Defaults to 'last_7d' when omitted. */
	@IsOptional()
	@IsIn(REPORT_PERIODS)
	period?: ReportPeriod;
}
