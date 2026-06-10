import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class CreateMaintenanceWindowDto {
  @IsEnum(["server", "environment", "project"])
  resource_type!: "server" | "environment" | "project";

  @IsInt()
  @IsPositive()
  resource_id!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsDateString()
  starts_at!: string;

  @IsDateString()
  ends_at!: string;
}

export class QueryMaintenanceWindowsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(["server", "environment", "project"])
  resource_type?: "server" | "environment" | "project";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  resource_id?: number;
}
