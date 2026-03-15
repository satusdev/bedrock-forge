import {
	IsArray,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class RoleCreateDto {
	@IsString()
	@MaxLength(100)
	name!: string;

	@IsString()
	@MaxLength(255)
	display_name!: string;

	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;

	@IsOptional()
	@IsString()
	@MaxLength(7)
	color?: string;

	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	@Min(1, { each: true })
	permission_ids?: number[];
}

export class RoleUpdateDto {
	@IsOptional()
	@IsString()
	@MaxLength(255)
	display_name?: string;

	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;

	@IsOptional()
	@IsString()
	@MaxLength(7)
	color?: string;

	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	@Min(1, { each: true })
	permission_ids?: number[];
}
