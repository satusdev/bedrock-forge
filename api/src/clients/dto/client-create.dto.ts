import {
	IsEmail,
	IsNumber,
	IsOptional,
	IsString,
	Length,
	Max,
	Min,
	MinLength,
} from 'class-validator';

export class ClientCreateDto {
	@IsString()
	@MinLength(1)
	name!: string;

	@IsEmail()
	email!: string;

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
	payment_terms?: number = 30;

	@IsOptional()
	@IsString()
	@Length(3, 3)
	currency?: string = 'USD';

	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(100)
	tax_rate?: number = 0;
}
