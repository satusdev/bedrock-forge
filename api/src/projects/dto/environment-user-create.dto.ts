import {
	IsEmail,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from 'class-validator';

export class EnvironmentUserCreateDto {
	@IsString()
	@MinLength(1)
	@MaxLength(120)
	user_login!: string;

	@IsEmail()
	@MaxLength(255)
	user_email!: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	role?: string = 'subscriber';

	@IsOptional()
	send_email?: boolean = false;
}
