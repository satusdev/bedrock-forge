import { IsString, IsOptional, IsHexColor, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateTagDto {
	@IsString()
	@MaxLength(50)
	name!: string;

	@IsOptional()
	@IsHexColor()
	color?: string;
}

export class UpdateTagDto extends PartialType(CreateTagDto) {}
