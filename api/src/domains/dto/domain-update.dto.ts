import {
	IsBoolean,
	IsDateString,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

export class DomainUpdateDto {
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
	@IsNumber()
	annual_cost?: number;

	@IsOptional()
	@IsBoolean()
	auto_renew?: boolean;

	@IsOptional()
	@IsBoolean()
	privacy_protection?: boolean;

	@IsOptional()
	@IsBoolean()
	transfer_lock?: boolean;

	@IsOptional()
	nameservers?: string[];

	@IsOptional()
	@IsString()
	@MaxLength(100)
	dns_provider?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	status?: string;

	@IsOptional()
	@IsString()
	notes?: string;
}
