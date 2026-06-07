import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class SetCloudflareSettingsDto {
	@IsString()
	@MinLength(20)
	api_token!: string;

	@IsString()
	@MinLength(3)
	zone_id!: string;

	@IsOptional()
	@IsString()
	zone_name?: string;
}

export class UpdateCloudflareDnsRecordDto {
	@IsOptional()
	@IsString()
	type?: string;

	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	content?: string;

	@IsOptional()
	@IsBoolean()
	proxied?: boolean;
}
