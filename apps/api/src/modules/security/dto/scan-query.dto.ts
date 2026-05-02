import { Type } from 'class-transformer';
import {
	IsOptional,
	IsInt,
	Min,
	Max,
	IsDateString,
	IsString,
} from 'class-validator';

export class ScanQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number = 25;
}

export class SecurityLogsQueryDto extends ScanQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	server_id?: number;

	@IsOptional()
	@IsString()
	event_type?: string;

	@IsOptional()
	@IsDateString()
	date_from?: string;

	@IsOptional()
	@IsDateString()
	date_to?: string;
}
