import {
	IsBoolean,
	IsDateString,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

export class SslUpdateDto {
	@IsOptional()
	@IsString()
	@MaxLength(50)
	provider?: string;

	@IsOptional()
	@IsDateString()
	expiry_date?: string;

	@IsOptional()
	@IsBoolean()
	auto_renew?: boolean;

	@IsOptional()
	@IsBoolean()
	is_active?: boolean;

	@IsOptional()
	@IsString()
	notes?: string;
}
