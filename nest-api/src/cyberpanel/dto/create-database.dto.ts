import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDatabaseDto {
	@IsString()
	@MaxLength(255)
	domain!: string;

	@IsString()
	@MaxLength(255)
	db_name!: string;

	@IsString()
	@MaxLength(255)
	db_user!: string;

	@IsString()
	@MinLength(8)
	@MaxLength(255)
	db_password!: string;
}
