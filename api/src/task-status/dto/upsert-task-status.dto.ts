import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertTaskStatusDto {
	@IsOptional()
	@IsString()
	status?: string;

	@IsOptional()
	@IsString()
	message?: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(100)
	progress?: number;

	@IsOptional()
	result?: unknown;

	@IsOptional()
	@IsString()
	logs?: string;

	@IsOptional()
	@IsString()
	started_at?: string | null;

	@IsOptional()
	@IsString()
	completed_at?: string | null;
}
