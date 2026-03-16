import {
	IsString,
	IsOptional,
	IsInt,
	IsPositive,
	MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateDomainDto {
	@IsString() @MaxLength(253) domain!: string;
	@IsInt() @IsPositive() environment_id!: number;
	@IsOptional() @IsString() registrar?: string;
	@IsOptional() @IsString() notes?: string;
}
export class UpdateDomainDto extends PartialType(CreateDomainDto) {}
