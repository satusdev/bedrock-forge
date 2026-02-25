import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	Put,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import {
	NotificationChannelCreateDto,
	NotificationChannelUpdateDto,
	NotificationTestDto,
} from './dto/notification-channel-create.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
	constructor(
		private readonly notificationsService: NotificationsService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get(['', '/'])
	async getChannels(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.notificationsService.getChannels(ownerId);
	}

	@Get('/notifications/')
	async getChannelsTrailingSlashAlias(
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.notificationsService.getChannels(ownerId);
	}

	@Get(':channelId')
	async getChannel(
		@Param('channelId', ParseIntPipe) channelId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.notificationsService.getChannel(channelId, ownerId);
	}

	@Post(['', '/'])
	async createChannel(
		@Body() payload: NotificationChannelCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.notificationsService.createChannel(payload, ownerId);
	}

	@Post('/notifications/')
	async createChannelTrailingSlashAlias(
		@Body() payload: NotificationChannelCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.notificationsService.createChannel(payload, ownerId);
	}

	@Put(':channelId')
	async updateChannel(
		@Param('channelId', ParseIntPipe) channelId: number,
		@Body() payload: NotificationChannelUpdateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.notificationsService.updateChannel(channelId, payload, ownerId);
	}

	@Delete(':channelId')
	async deleteChannel(
		@Param('channelId', ParseIntPipe) channelId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		await this.notificationsService.deleteChannel(channelId, ownerId);
	}

	@Post('test')
	async testChannel(
		@Body() payload: NotificationTestDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.notificationsService.testChannel(payload, ownerId);
	}
}
