import {
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class InvoiceItemCreateDto {
	@IsString()
	@MaxLength(1000)
	description!: string;

	@IsNumber()
	@Min(0)
	quantity!: number;

	@IsNumber()
	@Min(0)
	unit_price!: number;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	item_type?: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	project_id?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	subscription_id?: number;
}
