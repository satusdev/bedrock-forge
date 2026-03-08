import {
	IsBoolean,
	IsDateString,
	IsInt,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class DomainCreateDto {
	@IsInt()
	@Min(1)
	client_id!: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	project_id?: number;

	@IsString()
	@MaxLength(255)
	domain_name!: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	registrar?: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	registrar_name?: string;

	@IsOptional()
	@IsDateString()
	expiry_date?: string;

	@IsOptional()
	@IsDateString()
	registration_date?: string;

	@IsOptional()
	@IsNumber()
	annual_cost?: number;

	@IsOptional()
	@IsString()
	@MaxLength(3)
	currency?: string;

	@IsOptional()
	@IsBoolean()
	auto_renew?: boolean;

	@IsOptional()
	@IsBoolean()
	privacy_protection?: boolean;

	@IsOptional()
	nameservers?: string[];

	@IsOptional()
	@IsString()
	@MaxLength(100)
	dns_provider?: string;
}
