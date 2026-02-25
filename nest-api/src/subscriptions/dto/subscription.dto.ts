import {
	IsBoolean,
	IsDateString,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class CreateSubscriptionDto {
	@IsNumber()
	@Min(1)
	client_id!: number;

	@IsOptional()
	@IsNumber()
	@Min(1)
	project_id?: number | null;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	subscription_type?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	billing_cycle?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	amount?: number;

	@IsOptional()
	@IsString()
	@MaxLength(3)
	currency?: string;

	@IsOptional()
	@IsDateString()
	start_date?: string;

	@IsOptional()
	@IsBoolean()
	auto_renew?: boolean;

	@IsOptional()
	@IsNumber()
	@Min(0)
	reminder_days?: number;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	provider?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	external_id?: string;

	@IsOptional()
	@IsNumber()
	@Min(1)
	package_id?: number;

	@IsOptional()
	@IsBoolean()
	create_hosting?: boolean;

	@IsOptional()
	@IsBoolean()
	create_support?: boolean;
}

export class UpdateSubscriptionDto {
	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	billing_cycle?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	amount?: number;

	@IsOptional()
	@IsBoolean()
	auto_renew?: boolean;

	@IsOptional()
	@IsNumber()
	@Min(0)
	reminder_days?: number;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	status?: string;

	@IsOptional()
	@IsString()
	notes?: string;
}
