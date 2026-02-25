import {
	IsBoolean,
	IsIn,
	IsObject,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

export class NotificationChannelCreateDto {
	@IsString()
	@MaxLength(255)
	name!: string;

	@IsIn(['slack', 'email', 'telegram', 'webhook', 'discord'])
	channel_type!: 'slack' | 'email' | 'telegram' | 'webhook' | 'discord';

	@IsObject()
	config!: Record<string, unknown>;

	@IsOptional()
	@IsBoolean()
	is_active?: boolean;
}

export class NotificationChannelUpdateDto {
	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@IsOptional()
	@IsObject()
	config?: Record<string, unknown>;

	@IsOptional()
	@IsBoolean()
	is_active?: boolean;
}

export class NotificationTestDto {
	@IsOptional()
	channel_id?: number;

	@IsOptional()
	@IsIn(['slack', 'email', 'telegram', 'webhook', 'discord'])
	channel_type?: 'slack' | 'email' | 'telegram' | 'webhook' | 'discord';

	@IsOptional()
	@IsObject()
	config?: Record<string, unknown>;
}
