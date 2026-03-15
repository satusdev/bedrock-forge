import {
	ArrayMaxSize,
	ArrayUnique,
	IsArray,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class RunCommandRequestDto {
	@IsInt()
	@Min(1)
	project_server_id!: number;

	@IsString()
	@MaxLength(100)
	command!: string;

	@IsOptional()
	@IsArray()
	@ArrayMaxSize(30)
	@ArrayUnique()
	@IsString({ each: true })
	args?: string[];
}
