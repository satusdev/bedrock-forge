import {
  IsOptional,
  IsInt,
  IsString,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { MAX_PAGE_SIZE } from "../pagination";

const MAX_SEARCH_LENGTH = 100;

export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @Type(() => Number)
  limit: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  @Transform(({ value }) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  search?: string;
}
