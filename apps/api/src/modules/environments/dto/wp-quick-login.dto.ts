import { IsInt, IsPositive } from 'class-validator';

export class WpQuickLoginDto {
	@IsInt()
	@IsPositive()
	userId!: number;
}
