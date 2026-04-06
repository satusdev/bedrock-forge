import {
	IsString,
	IsInt,
	IsPositive,
	IsOptional,
	MinLength,
	MaxLength,
	IsUrl,
	IsArray,
	ValidateNested,
	IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class DbCredentialsDto {
	@IsString()
	@MinLength(1)
	dbName!: string;

	@IsString()
	@MinLength(1)
	dbUser!: string;

	@IsString()
	dbPassword!: string;

	@IsString()
	@MinLength(1)
	dbHost!: string;
}

export class BulkImportEntryDto {
	@IsInt()
	@IsPositive()
	server_id!: number;

	@IsString()
	@MinLength(1)
	@MaxLength(100)
	name!: string;

	@IsString()
	@MinLength(1)
	@MaxLength(500)
	root_path!: string;

	@IsUrl({ require_tld: false })
	url!: string;

	@IsOptional()
	@IsString()
	@MaxLength(50)
	type?: string;

	@IsInt()
	@IsPositive()
	client_id!: number;

	@IsOptional()
	@IsObject()
	@ValidateNested()
	@Type(() => DbCredentialsDto)
	db_credentials?: DbCredentialsDto;

	/** Registrable root domain when the site URL is a subdomain. */
	@IsOptional()
	@IsString()
	@MaxLength(253)
	main_domain?: string;
}

export class BulkImportProjectsDto {
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => BulkImportEntryDto)
	projects!: BulkImportEntryDto[];
}
