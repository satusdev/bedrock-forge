import { IsString, MinLength, Matches } from 'class-validator';

export class SetBillingSettingsDto {
	@IsString()
	@Matches(/^[A-Za-z]{3}$/)
	currency_code!: string;

	@IsString()
	@MinLength(2)
	currency_locale!: string;
}
