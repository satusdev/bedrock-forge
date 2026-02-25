import {
	ArrayMinSize,
	IsArray,
	IsDateString,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceItemCreateDto } from './invoice-item-create.dto';

export class InvoiceCreateDto {
	@IsInt()
	@Min(1)
	client_id!: number;

	@IsOptional()
	@IsDateString()
	issue_date?: string;

	@IsOptional()
	@IsDateString()
	due_date?: string;

	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => InvoiceItemCreateDto)
	items!: InvoiceItemCreateDto[];

	@IsOptional()
	@IsNumber()
	@Min(0)
	tax_rate?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	discount_amount?: number;

	@IsOptional()
	@IsString()
	notes?: string;

	@IsOptional()
	@IsString()
	terms?: string;

	@IsOptional()
	@IsString()
	@MaxLength(3)
	currency?: string;
}
