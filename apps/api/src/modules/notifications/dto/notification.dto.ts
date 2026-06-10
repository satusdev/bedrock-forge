import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsIn,
  MaxLength,
  MinLength,
} from "class-validator";
import { PartialType } from "@nestjs/mapped-types";
import type { NotificationEventType } from "@bedrock-forge/shared";

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(["slack", "google_chat", "webhook"])
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  slack_bot_token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slack_channel_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  google_chat_webhook_url?: string;

  /** Generic webhook URL — receives all events as HTTP POST JSON */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  webhook_url?: string;

  /** Optional HMAC-SHA256 signing secret — sent as X-Forge-Signature header */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhook_secret?: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}
