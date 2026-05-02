import {
	IsArray,
	IsInt,
	IsIn,
	IsBoolean,
	Min,
	Max,
	ArrayMinSize,
	IsOptional,
	IsEnum,
} from 'class-validator';
import type { SecurityScanType } from '@bedrock-forge/shared';

export class UpsertSecurityScheduleDto {
	@IsArray()
	@ArrayMinSize(1)
	@IsEnum(
		[
			'SSH_AUDIT',
			'SERVER_HARDENING',
			'MALWARE_SCAN',
			'WP_AUDIT',
			'PROJECT_MALWARE',
		],
		{ each: true },
	)
	scan_types!: SecurityScanType[];

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

	@IsOptional()
	@IsBoolean()
	enabled?: boolean;

	@IsOptional()
	@IsBoolean()
	notify_enabled?: boolean;

	@IsOptional()
	@IsIn(['critical', 'high', 'medium', 'low', 'info'])
	notify_threshold?: string;
}
