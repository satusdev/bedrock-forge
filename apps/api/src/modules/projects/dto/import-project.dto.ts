import {
	IsString,
	IsInt,
	IsPositive,
	IsOptional,
	MinLength,
	MaxLength,
	IsUrl,
} from 'class-validator';

export class ImportProjectDto {
	@IsInt()
	@IsPositive()
	server_id!: number;

	@IsString()
	@MinLength(1)
	@MaxLength(100)
	name!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(500)
	root_path!: string;

	@IsUrl({ require_tld: false })
	url!: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	type?: string;

	@IsInt()
	@IsPositive()
	client_id!: number;
}
