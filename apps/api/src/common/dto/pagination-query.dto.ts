import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationQueryDto {
	@IsOptional()
	@IsInt()
	@Min(1)
	@Type(() => Number)
	page: number = 1;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(200)
	@Type(() => Number)
	limit: number = 20;

	@IsOptional()
	@IsString()
	search?: string;
}
