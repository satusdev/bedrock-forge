import {
	IsString,
	IsOptional,
	IsNumber,
	IsPositive,
	MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateHostingPackageDto {
	@IsString() @MaxLength(100) name!: string;
	@IsOptional() @IsString() description?: string;
	@IsOptional() @IsNumber() @IsPositive() price_monthly?: number;
	@IsOptional() @IsNumber() @IsPositive() disk_gb?: number;
	@IsOptional() @IsNumber() @IsPositive() bandwidth_gb?: number;
	@IsOptional() @IsNumber() @IsPositive() max_sites?: number;
}
export class UpdateHostingPackageDto extends PartialType(
	CreateHostingPackageDto,
) {}

export class CreateSupportPackageDto {
	@IsString() @MaxLength(100) name!: string;
	@IsOptional() @IsString() description?: string;
	@IsOptional() @IsNumber() @IsPositive() price_monthly?: number;
	@IsOptional() @IsNumber() @IsPositive() hours_per_month?: number;
	@IsOptional() @IsNumber() @IsPositive() response_time_hours?: number;
}
export class UpdateSupportPackageDto extends PartialType(
	CreateSupportPackageDto,
) {}
