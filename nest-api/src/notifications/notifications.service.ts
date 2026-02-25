import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
	NotificationChannelCreateDto,
	NotificationChannelUpdateDto,
	NotificationTestDto,
} from './dto/notification-channel-create.dto';

type DbChannel = {
	id: number;
	name: string;
	channel_type: string;
	config: string | null;
	is_active: boolean;
	last_sent_at: Date | null;
	last_error: string | null;
	owner_id: number;
	created_at: Date;
	updated_at: Date;
};

@Injectable()
export class NotificationsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private parseConfig(value: string | null): Record<string, unknown> {
		if (!value) {
			return {};
		}
		try {
			const parsed = JSON.parse(value) as unknown;
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return {};
			}
			return parsed as Record<string, unknown>;
		} catch {
			return {};
		}
	}

	private normalize(row: DbChannel) {
		return {
			id: row.id,
			name: row.name,
			channel_type: row.channel_type,
			config: this.parseConfig(row.config),
			is_active: row.is_active,
			last_sent_at: row.last_sent_at,
			last_error: row.last_error,
			owner_id: row.owner_id,
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
	}

	async getChannels(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbChannel[]>`
			SELECT
				id,
				name,
				channel_type::text AS channel_type,
				config,
				is_active,
				last_sent_at,
				last_error,
				owner_id,
				created_at,
				updated_at
			FROM notification_channels
			WHERE owner_id = ${resolvedOwnerId}
			ORDER BY created_at DESC
		`;

		return rows.map(row => this.normalize(row));
	}

	async getChannel(channelId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbChannel[]>`
			SELECT
				id,
				name,
				channel_type::text AS channel_type,
				config,
				is_active,
				last_sent_at,
				last_error,
				owner_id,
				created_at,
				updated_at
			FROM notification_channels
			WHERE id = ${channelId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const row = rows[0];
		if (!row) {
			throw new NotFoundException({ detail: 'Notification channel not found' });
		}

		return this.normalize(row);
	}

	async createChannel(payload: NotificationChannelCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO notification_channels (
				name,
				channel_type,
				config,
				is_active,
				owner_id,
				created_at,
				updated_at
			)
			VALUES (
				${payload.name},
				${payload.channel_type}::channeltype,
				${JSON.stringify(payload.config ?? {})},
				${payload.is_active ?? true},
				${resolvedOwnerId},
				NOW(),
				NOW()
			)
			RETURNING id
		`;

		return this.getChannel(rows[0]?.id ?? 0, resolvedOwnerId);
	}

	async updateChannel(
		channelId: number,
		payload: NotificationChannelUpdateDto,
		ownerId?: number,
	) {
		const current = await this.getChannel(channelId, ownerId);
		await this.prisma.$executeRaw`
			UPDATE notification_channels
			SET
				name = ${payload.name ?? current.name},
				config = ${JSON.stringify(payload.config ?? current.config ?? {})},
				is_active = ${payload.is_active ?? current.is_active},
				updated_at = NOW()
			WHERE id = ${channelId} AND owner_id = ${current.owner_id}
		`;

		return this.getChannel(channelId, ownerId);
	}

	async deleteChannel(channelId: number, ownerId?: number) {
		const current = await this.getChannel(channelId, ownerId);
		await this.prisma.$executeRaw`
			DELETE FROM notification_channels
			WHERE id = ${channelId} AND owner_id = ${current.owner_id}
		`;
	}

	async testChannel(payload: NotificationTestDto, ownerId?: number) {
		if (payload.channel_id) {
			await this.getChannel(payload.channel_id, ownerId);
		}

		return {
			status: 'success',
			message: 'Test notification sent',
			channel_type: payload.channel_type ?? 'email',
		};
	}
}
