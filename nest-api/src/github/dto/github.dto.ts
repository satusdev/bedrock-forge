import { Type } from 'class-transformer';
import {
	IsArray,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
	ValidateIf,
} from 'class-validator';

export class GitHubAuthUrlQueryDto {
	@IsOptional()
	@IsString()
	redirect_uri?: string;
}

export class GitHubAuthDto {
	@ValidateIf(payload => !payload.code)
	@IsString()
	@IsOptional()
	token?: string;

	@ValidateIf(payload => !payload.token)
	@IsString()
	@IsOptional()
	code?: string;

	@IsOptional()
	@IsString()
	state?: string;
}

export class GitHubCommitsQueryDto {
	@IsOptional()
	@IsString()
	branch?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number;
}

export class GitHubPullRequestsQueryDto {
	@IsOptional()
	@IsString()
	state?: string;
}

export class GitHubDeploymentsQueryDto {
	@IsOptional()
	@IsString()
	environment?: string;
}

export class GitHubCloneDto {
	@IsString()
	target_path!: string;

	@IsOptional()
	@IsString()
	branch?: string;
}

export class GitHubCreateWebhookDto {
	@IsString()
	repository_url!: string;

	@IsString()
	webhook_url!: string;

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	events?: string[];
}

export class GitHubCreateDeploymentDto {
	@IsString()
	repository_url!: string;

	@IsString()
	ref!: string;

	@IsString()
	environment!: string;

	@IsOptional()
	@IsString()
	description?: string;
}
