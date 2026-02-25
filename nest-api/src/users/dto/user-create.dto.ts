import {
	IsArray,
	IsBoolean,
	IsEmail,
	IsInt,
	IsOptional,
	IsString,
	MaxLength,
	Min,
	MinLength,
} from 'class-validator';

export class UserCreateDto {
	@IsEmail()
	@MaxLength(255)
	email!: string;

	@IsString()
	@MaxLength(100)
	username!: string;

	@IsString()
	@MinLength(8)
	password!: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	full_name?: string;

	@IsOptional()
	@IsBoolean()
	is_active?: boolean;

	@IsOptional()
	@IsBoolean()
	is_superuser?: boolean;

	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	@Min(1, { each: true })
	role_ids?: number[];
}

export class UserUpdateDto {
	@IsOptional()
	@IsEmail()
	@MaxLength(255)
	email?: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	username?: string;

	@IsOptional()
	@IsString()
	@MinLength(8)
	password?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	full_name?: string;

	@IsOptional()
	@IsBoolean()
	is_active?: boolean;

	@IsOptional()
	@IsBoolean()
	is_superuser?: boolean;

	@IsOptional()
	@IsArray()
	@IsInt({ each: true })
	@Min(1, { each: true })
	role_ids?: number[];
}

export class UserResetPasswordDto {
	@IsString()
	@MinLength(8)
	new_password!: string;
}
