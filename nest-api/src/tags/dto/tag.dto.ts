import {
	IsArray,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class TagCreateDto {
	@IsString()
	@MaxLength(100)
	name!: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	slug?: string;

	@IsOptional()
	@IsString()
	@MaxLength(7)
	color?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	icon?: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	description?: string;
}

export class TagUpdateDto {
	@IsOptional()
	@IsString()
	@MaxLength(100)
	name?: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	slug?: string;

	@IsOptional()
	@IsString()
	@MaxLength(7)
	color?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	icon?: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	description?: string;
}

export class TagAssignmentDto {
	@IsArray()
	@IsInt({ each: true })
	@Min(1, { each: true })
	tag_ids!: number[];
}
