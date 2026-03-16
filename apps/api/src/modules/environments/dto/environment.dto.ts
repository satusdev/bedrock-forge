import {
	IsString,
	IsOptional,
	IsInt,
	IsPositive,
	IsIn,
	MaxLength,
	IsObject,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateEnvironmentDto {
	@IsString() @MaxLength(100) name!: string;
	@IsIn(['production', 'staging', 'development']) type!: string;
	@IsString() @MaxLength(255) domain!: string;
	@IsString() @MaxLength(255) docroot!: string;
	@IsOptional() @IsInt() @IsPositive() cyberpanel_user_id?: number;
	/** Plain credentials object — will be AES-256-GCM encrypted as JSONB */
	@IsOptional() @IsObject() cyberpanel_login?: Record<string, unknown>;
	@IsOptional() @IsString() notes?: string;
}

export class UpdateEnvironmentDto extends PartialType(CreateEnvironmentDto) {}
