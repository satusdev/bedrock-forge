import {
	IsBoolean,
	IsEmail,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

export class CreateWebsiteDto {
	@IsString()
	@MaxLength(255)
	domain!: string;

	@IsEmail()
	email!: string;

	@IsOptional()
	@IsString()
	@MaxLength(20)
	php_version?: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	package?: string;

	@IsOptional()
	@IsBoolean()
	ssl?: boolean;
}
