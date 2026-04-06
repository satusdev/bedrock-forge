import {
	IsString,
	IsOptional,
	IsInt,
	IsPositive,
	MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateDomainDto {
	@IsString() @MaxLength(253) name!: string;
	@IsInt() @IsPositive() project_id!: number;
}
export class UpdateDomainDto extends PartialType(CreateDomainDto) {}

export class DomainQueryDto extends PaginationQueryDto {
	@IsOptional() @Type(() => Number) @IsInt() @IsPositive() projectId?: number;
}
