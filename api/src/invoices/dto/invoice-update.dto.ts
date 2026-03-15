import {
	IsDateString,
	IsIn,
	IsNumber,
	IsOptional,
	IsString,
	Min,
} from 'class-validator';

export class InvoiceUpdateDto {
	@IsOptional()
	@IsIn(['draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded'])
	status?: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

	@IsOptional()
	@IsDateString()
	due_date?: string;

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
}
