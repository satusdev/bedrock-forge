import {
	IsString,
	IsOptional,
	MaxLength,
	MinLength,
	Matches,
	IsIn,
} from 'class-validator';

export class CreateCustomPluginDto {
	@IsString()
	@MinLength(1)
	@MaxLength(100)
	name!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(100)
	@Matches(/^[a-z0-9_-]+$/, {
		message:
			'Slug must contain only lowercase letters, numbers, hyphens, and underscores',
	})
	slug!: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	description?: string;

	@IsString()
	@MinLength(1)
	@MaxLength(500)
	repo_url!: string;

	@IsOptional()
	@IsString()
	@MaxLength(200)
	@Matches(/^[.a-zA-Z0-9/_-]+$/, {
		message: 'repo_path must contain only safe path characters',
	})
	repo_path?: string;

	@IsOptional()
	@IsIn(['plugin', 'theme'])
	type?: string;
}
