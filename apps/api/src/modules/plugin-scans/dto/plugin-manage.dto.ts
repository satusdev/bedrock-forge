import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

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
}
