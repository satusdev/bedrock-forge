import {
	IsString,
	IsOptional,
	IsNumber,
	IsPositive,
	IsBoolean,
	MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateHostingPackageDto {
	@IsString() @MaxLength(100) name!: string;
	@IsOptional() @IsString() description?: string;
	@IsNumber() @IsPositive() price_monthly!: number;
	@IsNumber() @IsPositive() storage_gb!: number;
	@IsNumber() @IsPositive() bandwidth_gb!: number;
	@IsNumber() @IsPositive() max_sites!: number;
	@IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateHostingPackageDto extends PartialType(
	CreateHostingPackageDto,
) {}

export class CreateSupportPackageDto {
	@IsString() @MaxLength(100) name!: string;
	@IsOptional() @IsString() description?: string;
	@IsNumber() @IsPositive() price_monthly!: number;
	@IsNumber() @IsPositive() response_hours!: number;
	@IsOptional() @IsBoolean() includes_updates?: boolean;
	@IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateSupportPackageDto extends PartialType(
	CreateSupportPackageDto,
) {}
