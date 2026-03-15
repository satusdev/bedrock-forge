import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CloudflareConnectDto {
	@IsString()
	api_token!: string;
}

export class CloudflareExpiringQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(3650)
	days?: number;
}
