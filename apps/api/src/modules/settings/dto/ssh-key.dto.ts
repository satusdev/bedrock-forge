import { IsString, MinLength } from 'class-validator';

export class SetSshKeyDto {
	@IsString()
	@MinLength(20)
	key!: string;
}
