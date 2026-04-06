import {
	IsString,
	IsEmail,
	MinLength,
	MaxLength,
	IsArray,
	IsEnum,
	IsOptional,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Role } from '@bedrock-forge/shared';

export class CreateUserDto {
	@IsString()
	@MinLength(2)
	@MaxLength(100)
	name!: string;

	@IsEmail()
	email!: string;

	@IsString()
	@MinLength(8)
	@MaxLength(128)
	password!: string;

	@IsArray()
	@IsEnum(['admin', 'manager', 'client'], { each: true })
	roles!: Role[];
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
	// password is optional on update (PartialType handles it)
}

export class AssignRolesDto {
	@IsArray()
	@IsEnum(['admin', 'manager', 'client'], { each: true })
	roles!: Role[];
}
