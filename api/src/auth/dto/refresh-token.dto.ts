import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
	@IsString()
	@MinLength(10)
	refresh_token!: string;
}
