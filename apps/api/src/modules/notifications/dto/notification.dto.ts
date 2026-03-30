import {
	IsString,
	IsArray,
	IsOptional,
	IsBoolean,
	IsIn,
	MaxLength,
	MinLength,
	ArrayNotEmpty,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import {
	ALL_NOTIFICATION_EVENTS,
	NotificationEventType,
} from '@bedrock-forge/shared';

export class CreateChannelDto {
	@IsString()
	@MinLength(1)
	@MaxLength(100)
	name!: string;

	@IsOptional()
	@IsString()
	@IsIn(['slack'])
	type?: string;

	@IsOptional()
	@IsString()
	@MaxLength(500)
	slack_bot_token?: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	slack_channel_id?: string;

	@IsArray()
	@IsString({ each: true })
	events!: string[];

	@IsOptional()
	@IsBoolean()
	active?: boolean;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}
