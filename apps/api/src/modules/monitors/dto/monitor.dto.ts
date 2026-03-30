import { IsBoolean, IsInt, IsOptional, IsPositive, Min } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateMonitorDto {
	@IsInt() @IsPositive() environment_id!: number;
	/** Check interval in seconds (minimum 30) */
	@IsInt() @Min(30) interval_seconds!: number;
	@IsOptional() @IsBoolean() enabled?: boolean;
}
export class UpdateMonitorDto extends PartialType(CreateMonitorDto) {}
