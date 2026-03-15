import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
	Min,
	MinLength,
} from 'class-validator';

export class UrlReplaceRequestDto {
	@Type(() => Number)
	@IsInt()
	@Min(1)
	project_server_id!: number;

	@IsString()
	@MinLength(3)
	source_url!: string;

	@IsString()
	@MinLength(3)
	target_url!: string;

	@IsOptional()
	@IsBoolean()
	backup_before?: boolean;

	@IsOptional()
	@IsBoolean()
	download_backup?: boolean;

	@IsOptional()
	@IsBoolean()
	dry_run?: boolean;
}

export class DriveCloneRequestDto {
	@Type(() => Number)
	@IsInt()
	@Min(1)
	project_id!: number;

	@Type(() => Number)
	@IsInt()
	@Min(1)
	target_server_id!: number;

	@IsString()
	@MinLength(3)
	target_domain!: string;

	@IsString()
	environment!: string;

	@IsString()
	backup_timestamp!: string;

	@IsOptional()
	@IsString()
	source_url?: string;

	@IsOptional()
	@IsString()
	target_url?: string;

	@IsOptional()
	@IsBoolean()
	create_cyberpanel_site?: boolean;

	@IsOptional()
	@IsBoolean()
	include_database?: boolean;

	@IsOptional()
	@IsBoolean()
	include_files?: boolean;

	@IsOptional()
	@IsString()
	set_shell_user?: string;

	@IsOptional()
	@IsBoolean()
	run_composer_install?: boolean;

	@IsOptional()
	@IsBoolean()
	run_composer_update?: boolean;

	@IsOptional()
	@IsBoolean()
	run_wp_plugin_update?: boolean;

	@IsOptional()
	@IsBoolean()
	dry_run?: boolean;
}
