import {
	IsDateString,
	IsEmail,
	IsIn,
	IsNumber,
	IsOptional,
	IsString,
	Length,
	Max,
	Min,
} from 'class-validator';

const billingStatusValues = ['active', 'inactive', 'trial', 'overdue'] as const;

export class ClientUpdateDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsEmail()
	email?: string;

	@IsOptional()
	@IsString()
	company?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@IsEmail()
	billing_email?: string;

	@IsOptional()
	@IsString()
	address?: string;

	@IsOptional()
	@IsString()
	website?: string;

	@IsOptional()
	@IsString()
	notes?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	payment_terms?: number;

	@IsOptional()
	@IsString()
	@Length(3, 3)
	currency?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(100)
	tax_rate?: number;

	@IsOptional()
	@IsIn(billingStatusValues)
	billing_status?: (typeof billingStatusValues)[number];

	@IsOptional()
	@IsDateString()
	contract_start?: string;

	@IsOptional()
	@IsDateString()
	contract_end?: string;

	@IsOptional()
	@IsNumber()
	monthly_rate?: number;
}
