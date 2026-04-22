import { IsString, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateDomainDto {
	@IsString() @MaxLength(253) name!: string;
}
export class UpdateDomainDto extends PartialType(CreateDomainDto) {}

export class DomainQueryDto extends PaginationQueryDto {}
