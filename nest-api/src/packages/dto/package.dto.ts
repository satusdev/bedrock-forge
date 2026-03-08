import {
	IsArray,
	IsBoolean,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class CreatePackageDto {
	@IsOptional()
	@IsString()
	@MaxLength(20)
	package_type?: string;

	@IsString()
	@MaxLength(100)
	name!: string;

	@IsString()
	@MaxLength(100)
	slug!: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	disk_space_gb?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	bandwidth_gb?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	domains_limit?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	databases_limit?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	email_accounts_limit?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	monthly_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	quarterly_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	yearly_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	biennial_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	setup_fee?: number;

	@IsOptional()
	@IsString()
	@MaxLength(3)
	currency?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	hosting_yearly_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	support_monthly_price?: number;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	features?: string[];

	@IsOptional()
	@IsBoolean()
	is_featured?: boolean;
}

export class UpdatePackageDto {
	@IsOptional()
	@IsString()
	@MaxLength(20)
	package_type?: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	name?: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	disk_space_gb?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	bandwidth_gb?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	domains_limit?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	databases_limit?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	email_accounts_limit?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	monthly_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	quarterly_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	yearly_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	biennial_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	setup_fee?: number;

	@IsOptional()
	@IsString()
	@MaxLength(3)
	currency?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	hosting_yearly_price?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	support_monthly_price?: number;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	features?: string[];

	@IsOptional()
	@IsBoolean()
	is_active?: boolean;

	@IsOptional()
	@IsBoolean()
	is_featured?: boolean;
}
