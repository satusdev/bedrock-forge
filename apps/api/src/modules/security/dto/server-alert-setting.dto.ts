import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class UpsertServerAlertSettingDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  ssh_login_alerts_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  file_change_alerts_enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  interval_minutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  file_watch_paths?: string[];
}
