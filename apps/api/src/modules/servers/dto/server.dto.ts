import {
  IsString,
  IsOptional,
  IsIP,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import { PartialType } from "@nestjs/mapped-types";

export class CreateServerDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsIP() ip_address!: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  ssh_port?: number;
  @IsString() @IsNotEmpty() @MaxLength(100) ssh_user!: string;
  /**
   * Plain private key — AES-256-GCM encrypted on store.
   * Optional: when omitted the system falls back to the global_ssh_private_key setting.
   */
  @IsOptional() @IsString() @MaxLength(20_000) ssh_private_key?: string;
  @IsOptional() @IsString() @MaxLength(50) provider?: string;
}

export class UpdateServerDto extends PartialType(CreateServerDto) {}
