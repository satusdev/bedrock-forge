import { IsEmail, IsString, MinLength, Matches } from 'class-validator';

export class RegisterDto {
	@IsEmail()
	email!: string;

	@IsString()
	@MinLength(2)
	name!: string;

	@IsString()
	@MinLength(12)
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d])/, {
		message:
			'Password must contain uppercase, lowercase, number, and special character',
	})
	password!: string;
}

export class LoginDto {
	@IsEmail()
	email!: string;

	@IsString()
	@MinLength(1)
	password!: string;
}

export class RefreshTokenDto {
	@IsString()
	@MinLength(1)
	refreshToken!: string;
}
