import {
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class PaymentRecordDto {
	@IsNumber()
	@Min(0.01)
	amount!: number;

	@IsString()
	@MaxLength(50)
	payment_method!: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	payment_reference?: string;
}
