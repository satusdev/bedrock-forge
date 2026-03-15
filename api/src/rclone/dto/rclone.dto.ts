import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RcloneAuthorizeRequestDto {
	@IsString()
	@IsNotEmpty()
	token!: string;

	@IsOptional()
	@IsString()
	remote_name?: string;

	@IsOptional()
	@IsString()
	scope?: string;
}

export class RcloneS3RequestDto {
	@IsString()
	@IsNotEmpty()
	access_key_id!: string;

	@IsString()
	@IsNotEmpty()
	secret_access_key!: string;

	@IsOptional()
	@IsString()
	region?: string;

	@IsOptional()
	@IsString()
	endpoint?: string;

	@IsOptional()
	@IsString()
	provider?: string;

	@IsOptional()
	@IsString()
	name?: string;
}
