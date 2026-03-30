import {
	IsString,
	IsOptional,
	IsInt,
	IsPositive,
	MaxLength,
	IsUrl,
	IsIn,
	ValidateNested,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';

const ENVIRONMENT_TYPES = ['production', 'staging', 'development'] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];

export class UpsertDbCredentialsDto {
	@IsString() @MaxLength(100) dbName!: string;
	@IsString() @MaxLength(100) dbUser!: string;
	@IsString() @MaxLength(255) dbPassword!: string;
	@IsString() @MaxLength(100) dbHost!: string;
}

export class CreateEnvironmentDto {
	@IsInt() @IsPositive() server_id!: number;
	/** Environment type: production | staging | development */
	@IsIn(ENVIRONMENT_TYPES) type!: EnvironmentType;
	@IsUrl() url!: string;
	@IsString() @MaxLength(500) root_path!: string;
	/** Persistent remote path on the server for backup storage */
	@IsOptional() @IsString() @MaxLength(500) backup_path?: string;
	/** Google Drive folder ID for backup destination override per environment */
	@IsOptional() @IsString() @MaxLength(500) google_drive_folder_id?: string;
	/** DB credentials extracted from the server scan — stored encrypted at creation time */
	@IsOptional()
	@ValidateNested()
	@Type(() => UpsertDbCredentialsDto)
	db_credentials?: UpsertDbCredentialsDto;
}

export class UpdateEnvironmentDto extends PartialType(CreateEnvironmentDto) {}
