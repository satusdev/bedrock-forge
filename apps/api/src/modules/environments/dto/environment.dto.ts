import {
  IsString,
  IsOptional,
  IsInt,
  IsPositive,
  MaxLength,
  IsUrl,
  IsIn,
  ValidateNested,
  IsArray,
  Matches,
  IsNotEmpty,
} from "class-validator";
import { PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";

const ENVIRONMENT_TYPES = ["production", "staging", "development"] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];

/**
 * Allowlist for remote filesystem paths used in SSH commands.
 * Prevents shell injection via path traversal or shell metacharacters.
 */
const ABSOLUTE_SAFE_PATH_REGEX =
  /^\/(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9/_\-.]+$/;
const TABLE_NAME_REGEX = /^[A-Za-z0-9_$]+$/;
const POST_TYPE_REGEX = /^[A-Za-z0-9_-]+$/;

export class UpsertDbCredentialsDto {
  @IsString() @IsNotEmpty() @MaxLength(100) dbName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) dbUser!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) dbPassword!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) dbHost!: string;
}

export class CreateEnvironmentDto {
  @IsInt() @IsPositive() server_id!: number;
  /** Environment type: production | staging | development */
  @IsIn(ENVIRONMENT_TYPES) type!: EnvironmentType;
  @IsUrl() @MaxLength(500) url!: string;
  /**
   * Absolute path to the WordPress root on the remote server.
   * Restricted to alphanumeric, `/`, `_`, `-`, `.` to prevent shell injection.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(ABSOLUTE_SAFE_PATH_REGEX, {
    message:
      "root_path must be an absolute path without traversal and may only contain letters, numbers, slashes, underscores, hyphens, and dots",
  })
  root_path!: string;
  /** Persistent remote path on the server for backup storage */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(ABSOLUTE_SAFE_PATH_REGEX, {
    message:
      "backup_path must be an absolute path without traversal and may only contain letters, numbers, slashes, underscores, hyphens, and dots",
  })
  backup_path?: string;
  /** Google Drive folder ID for backup destination override per environment */
  @IsOptional() @IsString() @MaxLength(500) google_drive_folder_id?: string;
  /** DB credentials extracted from the server scan — stored encrypted at creation time */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertDbCredentialsDto)
  db_credentials?: UpsertDbCredentialsDto;
  /**
   * WP table names on the TARGET that must not be overwritten during a DB push or clone.
   * The dump excludes these tables; all others are fully replaced (DROP TABLE in dump).
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @Matches(TABLE_NAME_REGEX, {
    each: true,
    message:
      "protected_tables entries may only contain letters, numbers, underscores, and dollar signs",
  })
  protected_tables?: string[];

  /**
   * SQL queries run on the TARGET immediately after database import to sanitize/filter/protect data.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sql_protection_queries?: string[];

  /**
   * WP custom post types to be preserved on the TARGET during a DB push or clone.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @Matches(POST_TYPE_REGEX, {
    each: true,
    message:
      "protected_post_types entries may only contain letters, numbers, underscores, and hyphens",
  })
  protected_post_types?: string[];
}

export class UpdateEnvironmentDto extends PartialType(CreateEnvironmentDto) {}
