import {
	IsString,
	IsOptional,
	IsInt,
	IsPositive,
	MaxLength,
	IsUrl,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateProjectDto {
	@IsString() @MaxLength(100) name!: string;
	@IsInt() @IsPositive() client_id!: number;
	@IsInt() @IsPositive() server_id!: number;
	@IsOptional() @IsInt() @IsPositive() hosting_package_id?: number;
	@IsOptional() @IsInt() @IsPositive() support_package_id?: number;
	@IsOptional() @IsString() notes?: string;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
