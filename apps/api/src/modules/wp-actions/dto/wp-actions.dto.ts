import { IsEnum, IsBoolean, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class WpFixActionDto {
	@IsEnum(['flush_rewrite', 'clear_cache', 'fix_permissions', 'disable_plugins', 'enable_plugins'])
	action!: 'flush_rewrite' | 'clear_cache' | 'fix_permissions' | 'disable_plugins' | 'enable_plugins';
}

export class WpDebugModeDto {
	@IsBoolean()
	enabled!: boolean;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(480)
	revert_after_minutes?: number;
}

export class WpLogsQueryDto {
	@IsOptional()
	@IsIn(['debug', 'php', 'nginx', 'apache'])
	type?: 'debug' | 'php' | 'nginx' | 'apache';

	@IsOptional()
	@Transform(({ value }) => parseInt(value as string, 10))
	@IsInt()
	@Min(1)
	@Max(500)
	lines?: number;
}
