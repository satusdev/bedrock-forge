import { IsOptional, IsArray, IsInt } from "class-validator";
import { Type } from "class-transformer";

export class GenerateSecurityReportDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  serverIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  environmentIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  channelIds?: number[];
}
