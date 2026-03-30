import { IsOptional, IsString } from 'class-validator';

/**
 * EnqueuePluginScanDto
 *
 * No required body fields — the environment is resolved from the route param.
 * Kept for module consistency and future extension (e.g. scan filters).
 */
export class EnqueuePluginScanDto {
	@IsOptional()
	@IsString()
	label?: string;
}
