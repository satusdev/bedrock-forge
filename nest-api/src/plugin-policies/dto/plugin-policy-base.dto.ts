import {
	ArrayUnique,
	IsArray,
	IsBoolean,
	IsObject,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

export class PluginPolicyBaseDto {
	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsString({ each: true })
	allowed_plugins?: string[];

	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsString({ each: true })
	required_plugins?: string[];

	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsString({ each: true })
	blocked_plugins?: string[];

	@IsOptional()
	@IsObject()
	pinned_versions?: Record<string, string>;

	@IsOptional()
	@IsString()
	notes?: string;
}

export class ProjectPolicyUpdateDto extends PluginPolicyBaseDto {
	@IsOptional()
	@IsBoolean()
	inherit_default?: boolean;
}
