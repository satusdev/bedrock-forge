import {
	IsBoolean,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from 'class-validator';

const environmentValues = ['staging', 'production', 'development'] as const;

export class EnvironmentCreateDto {
	@IsString()
	@IsIn(environmentValues)
	environment!: (typeof environmentValues)[number];

	@IsInt()
	server_id!: number;

	@IsString()
	@MinLength(1)
	@MaxLength(500)
	wp_url!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(500)
	wp_path!: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	ssh_user?: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	ssh_key_path?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	database_name?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	database_user?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	database_password?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	gdrive_backups_folder_id?: string;

	@IsOptional()
	@IsString()
	@MaxLength(1000)
	notes?: string;

	@IsOptional()
	@IsBoolean()
	is_primary?: boolean;
}
