import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsPositive,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateMonitorDto {
	@IsInt() @IsPositive() environment_id!: number;
	/** Check interval in seconds (minimum 30) */
	@IsInt() @Min(30) interval_seconds!: number;
	@IsOptional() @IsBoolean() enabled?: boolean;

	// ── Advanced checks ──────────────────────────────────────────────────────

	/** Enable TLS certificate expiry checking */
	@IsOptional() @IsBoolean() check_ssl?: boolean;
	/** Alert when SSL certificate expires within N days. null = no alert */
	@IsOptional() @IsInt() @Min(1) @Max(365) ssl_alert_days?: number | null;

	/** Enable DNS resolution checking */
	@IsOptional() @IsBoolean() check_dns?: boolean;

	/** Enable keyword/content matching in HTTP response body */
	@IsOptional() @IsBoolean() check_keyword?: boolean;
	/** Keyword to search for in the response body (required when check_keyword=true) */
	@IsOptional() @IsString() @MaxLength(200) keyword?: string;
}

export class UpdateMonitorDto extends PartialType(CreateMonitorDto) {}
