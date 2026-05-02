import {
	IsBoolean,
	IsNumber,
	IsOptional,
	IsString,
	Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class FindingsQueryDto {
	/** Comma-separated severities: critical,high,medium,low,info */
	@IsOptional()
	@IsString()
	severity?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	server_id?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	environment_id?: number;

	@IsOptional()
	@IsString()
	scan_type?: string;

	/** If true, include acknowledged findings; if false (default), exclude them */
	@IsOptional()
	@Transform(({ value }) => value === 'true' || value === true)
	@IsBoolean()
	acknowledged?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(1)
	page?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(1)
	limit?: number;
}
