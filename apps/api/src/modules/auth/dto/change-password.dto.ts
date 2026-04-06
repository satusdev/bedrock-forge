import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class ChangePasswordDto {
	@IsString()
	current_password!: string;

	@IsString()
	@MinLength(12, { message: 'New password must be at least 12 characters' })
	@MaxLength(128)
	@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d])/, {
		message:
			'Password must contain uppercase, lowercase, number, and special character',
	})
	new_password!: string;
}
