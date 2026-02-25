import {
	IsEmail,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from 'class-validator';

export class RegisterDto {
	@IsEmail()
	email!: string;

	@IsString()
	@MinLength(3)
	@MaxLength(100)
	username!: string;

	@IsString()
	@MinLength(8)
	password!: string;

	@IsOptional()
	@IsString()
	full_name?: string;
}
