import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UserUpdateDto {
	@IsOptional()
	@IsEmail()
	email?: string;

	@IsOptional()
	@IsString()
	username?: string;

	@IsOptional()
	@IsString()
	full_name?: string | null;
}
