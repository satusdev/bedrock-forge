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

export class SslCreateDto {
	@IsString()
	@MaxLength(255)
	common_name!: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	domain_id?: number;

	@IsOptional()
	@IsInt()
	@Min(1)
	project_id?: number;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	provider?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	certificate_type?: string;

	@IsDateString()
	issue_date!: string;

	@IsDateString()
	expiry_date!: string;

	@IsOptional()
	@IsBoolean()
	auto_renew?: boolean;

	@IsOptional()
	@IsBoolean()
	is_wildcard?: boolean;

	@IsOptional()
	@IsNumber()
	annual_cost?: number;

	@IsOptional()
	san_domains?: string[];
}
