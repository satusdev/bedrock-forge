import {
	IsString,
	IsOptional,
	IsInt,
	IsPositive,
	IsIn,
	Min,
	Max,
	MaxLength,
	IsUrl,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateMonitorDto {
	@IsString() @MaxLength(100) name!: string;
	@IsInt() @IsPositive() environment_id!: number;
	@IsUrl() url!: string;
	@IsIn(['http', 'https', 'keyword', 'ssl']) type!: string;
	/** Check interval in seconds */
	@IsInt() @Min(30) interval_seconds!: number;
	@IsOptional() @IsString() keyword?: string;
	@IsOptional() @IsInt() @Min(1) timeout_seconds?: number;
}
export class UpdateMonitorDto extends PartialType(CreateMonitorDto) {}
