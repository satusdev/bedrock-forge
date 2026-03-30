import {
	IsString,
	IsOptional,
	IsEmail,
	MaxLength,
	IsArray,
	IsInt,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';

export class CreateClientDto {
	@IsString()
	@MaxLength(100)
	name!: string;

	@IsOptional()
	@IsEmail()
	email?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@IsString()
	notes?: string;

	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	@Type(() => Number)
	tagIds?: number[];
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}
