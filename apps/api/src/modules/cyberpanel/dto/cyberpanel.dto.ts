import { IsString, IsUrl, MaxLength } from 'class-validator';

export class UpsertCyberpanelDto {
	@IsUrl() url!: string;
	@IsString() @MaxLength(100) username!: string;
	@IsString() @MaxLength(200) password!: string;
}
