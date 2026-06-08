import { IsEnum, IsInt, IsOptional, IsUrl, Min } from "class-validator";

export class TriggerLighthouseAuditDto {
  @IsInt()
  @Min(1)
  environment_id!: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  url?: string;

  @IsOptional()
  @IsEnum(["mobile", "desktop"])
  strategy?: "mobile" | "desktop";
}
