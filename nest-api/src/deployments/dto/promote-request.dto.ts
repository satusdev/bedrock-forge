import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class PromoteRequestDto {
	@IsString()
	@MaxLength(255)
	staging_host!: string;

	@IsString()
	@MaxLength(255)
	staging_user!: string;

	@IsString()
	@MaxLength(255)
	prod_host!: string;

	@IsString()
	@MaxLength(255)
	prod_user!: string;

	@IsString()
	@IsUrl()
	staging_url!: string;

	@IsString()
	@IsUrl()
	prod_url!: string;

	@IsOptional()
	@IsString()
	project_path?: string;
}
