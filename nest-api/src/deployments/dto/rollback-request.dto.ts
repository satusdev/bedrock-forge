import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RollbackRequestDto {
	@IsOptional()
	@IsString()
	@MaxLength(255)
	target_release?: string;
}
