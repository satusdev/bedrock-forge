import {
	IsString,
	IsOptional,
	IsIP,
	IsInt,
	IsIn,
	Min,
	Max,
	MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateServerDto {
	@IsString() @MaxLength(100) name!: string;
	@IsIP() ip_address!: string;
	@IsOptional() @IsInt() @Min(1) @Max(65535) ssh_port?: number;
	@IsString() @MaxLength(100) ssh_username!: string;
	/** Plain private key — will be AES-256-GCM encrypted on store */
	@IsString() ssh_private_key!: string;
	@IsOptional() @IsString() ssh_passphrase?: string;
	@IsOptional() @IsString() @MaxLength(20) panel_type?: string;
	@IsOptional() @IsString() panel_url?: string;
	@IsOptional() @IsString() notes?: string;
}

export class UpdateServerDto extends PartialType(CreateServerDto) {}
