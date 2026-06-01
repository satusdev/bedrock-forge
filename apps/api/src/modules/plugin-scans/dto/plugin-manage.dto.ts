import { IsString, IsOptional, MaxLength, Matches, IsBoolean } from 'class-validator';

export class PluginManageDto {
	@IsString()
	@MaxLength(100)
	@Matches(/^[a-z0-9_-]+$/, {
		message:
			'Slug must contain only lowercase letters, numbers, hyphens, and underscores',
	})
	slug!: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	version?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Matches(/^[\w.^~*|@, ><=!-]+$/, {
		message: 'Invalid version constraint characters',
	})
	constraint?: string;

	@IsOptional()
	@IsString()
	@Matches(/^(composer|manual)$/)
	workflow?: 'composer' | 'manual';

	@IsOptional()
	skipSafetyBackup?: boolean;
}

export class UpdatePluginDto {
	@IsOptional()
	@IsString()
	@MaxLength(50)
	version?: string;

	@IsOptional()
	skipSafetyBackup?: boolean;
}

export class TogglePluginStatusDto {
	@IsBoolean()
	active!: boolean;

	@IsOptional()
	skipSafetyBackup?: boolean;
}

export class UpdateAllPluginsDto {
	@IsOptional()
	skipSafetyBackup?: boolean;
}

