import {
	IsDateString,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditLogDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page: number = 1;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit: number = 25;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	user_id?: number;

	@IsOptional()
	@IsString()
	action?: string;

	@IsOptional()
	@IsString()
	resource_type?: string;

	@IsOptional()
	@IsDateString()
	date_from?: string;

	@IsOptional()
	@IsDateString()
	date_to?: string;
}
