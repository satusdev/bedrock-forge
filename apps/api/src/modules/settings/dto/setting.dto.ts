import { IsString } from 'class-validator';

export class SetSettingDto {
	@IsString()
	value!: string;
}
