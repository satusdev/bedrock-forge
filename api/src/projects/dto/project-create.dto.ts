import {
	ArrayMaxSize,
	IsArray,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from 'class-validator';

export class ProjectCreateDto {
	@IsString()
	@MinLength(1)
	@MaxLength(255)
	name!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(500)
	domain!: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	site_title?: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	github_repo_url?: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	github_branch?: string = 'main';

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(30)
	@IsString({ each: true })
	tags?: string[] = [];
}
