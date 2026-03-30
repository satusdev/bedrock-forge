import {
	IsNumber,
	IsPositive,
	IsInt,
	IsOptional,
	IsString,
	IsEnum,
	IsDateString,
	Min,
	Max,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class GenerateInvoiceDto {
	@IsNumber()
	@IsPositive()
	@IsInt()
	projectId!: number;

	@IsInt()
	@Min(2020)
	@Max(2100)
	year!: number;
}

export class GenerateBulkInvoiceDto {
	@IsInt()
	@Min(2020)
	@Max(2100)
	year!: number;
}

export class UpdateInvoiceDto {
	@IsOptional()
	@IsEnum(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
	status?: string;

	@IsOptional()
	@IsString()
	notes?: string;

	@IsOptional()
	@IsDateString()
	due_date?: string;
}

export class QueryInvoicesDto extends PaginationQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@IsPositive()
	client_id?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@IsPositive()
	project_id?: number;

	@IsOptional()
	@IsEnum(['draft', 'sent', 'paid', 'overdue', 'cancelled'])
	status?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(2020)
	@Max(2100)
	year?: number;
}
