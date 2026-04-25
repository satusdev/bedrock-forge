import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationsRepository } from './notifications.repository';
import { CreateChannelDto, UpdateChannelDto } from './dto/notification.dto';
import { EncryptionService } from '../../common/encryption/encryption.service';
import {
	QUEUES,
	JOB_TYPES,
	NotificationEventType,
} from '@bedrock-forge/shared';

@Injectable()
export class NotificationsService {
	constructor(
		private readonly repo: NotificationsRepository,
		private readonly encryption: EncryptionService,
		@InjectQueue(QUEUES.NOTIFICATIONS) private readonly notifQueue: Queue,
	) {}

	/* ── Channels ─────────────────────────────────────────────────────────── */

	async findAllChannels() {
		const channels = await this.repo.findAllChannels();
		return channels.map(c => this.sanitise(c));
	}

	async findChannelById(id: number) {
		const ch = await this.repo.findChannelById(id);
		if (!ch)
			throw new NotFoundException(`Notification channel #${id} not found`);
		return this.sanitise(ch);
	}

	async createChannel(dto: CreateChannelDto) {
		const enc = dto.slack_bot_token
			? this.encryption.encrypt(dto.slack_bot_token)
			: null;

		const ch = await this.repo.createChannel({
			name: dto.name,
			type: dto.type ?? 'slack',
			slack_bot_token_enc: enc,
			slack_channel_id: dto.slack_channel_id ?? null,
			events: dto.events,
			active: dto.active ?? true,
		});

		return this.sanitise(ch);
	}

	async updateChannel(id: number, dto: UpdateChannelDto) {
		await this.findChannelById(id);

		const updateData: Parameters<typeof this.repo.updateChannel>[1] = {};
		if (dto.name !== undefined) updateData.name = dto.name;
		if (dto.type !== undefined) updateData.type = dto.type;
		if (dto.slack_channel_id !== undefined)
			updateData.slack_channel_id = dto.slack_channel_id;
		if (dto.events !== undefined) updateData.events = dto.events;
		if (dto.active !== undefined) updateData.active = dto.active;
		if (dto.slack_bot_token !== undefined) {
			updateData.slack_bot_token_enc = dto.slack_bot_token
				? this.encryption.encrypt(dto.slack_bot_token)
				: null;
		}

		const ch = await this.repo.updateChannel(id, updateData);
		return this.sanitise(ch);
	}

	async removeChannel(id: number) {
		await this.findChannelById(id);
		return this.repo.removeChannel(id);
	}

	/* ── Dispatch ─────────────────────────────────────────────────────────── */

	/**
	 * Enqueue a notification job. The worker processes it and calls Slack.
	 * Fire-and-forget — never awaited in the hot path.
	 */
	dispatch(
		eventType: NotificationEventType | string,
		payload: Record<string, unknown>,
	): void {
		this.notifQueue
			.add(
				JOB_TYPES.NOTIFICATION_SEND,
				{ eventType, payload },
				{ attempts: 3, removeOnFail: 100 },
			)
			.catch(() => {
				// Silently swallow — notification failures must never break primary ops
			});
	}

	/* ── Test ─────────────────────────────────────────────────────────────── */

	async testChannel(id: number): Promise<{ ok: boolean; error?: string }> {
		const ch = await this.repo.findChannelById(id);
		if (!ch)
			throw new NotFoundException(`Notification channel #${id} not found`);

		try {
			const { WebClient } = await import('@slack/web-api');
			if (!ch.slack_bot_token_enc || !ch.slack_channel_id) {
				return { ok: false, error: 'Missing bot token or channel ID' };
			}

			const token = this.encryption.decrypt(ch.slack_bot_token_enc);
			const slack = new WebClient(token);
			await slack.chat.postMessage({
				channel: ch.slack_channel_id,
				text: `✅ Bedrock Forge — test notification from channel *${ch.name}*`,
			});

			await this.repo.createLog({
				channel_id: Number(ch.id),
				event_type: 'test',
				payload: { message: 'Test notification' },
				status: 'sent',
			});

			return { ok: true };
		} catch (err: unknown) {
			const raw = err instanceof Error ? err.message : String(err);
			const msg = raw.includes('channel_not_found')
				? `Channel not found. If this is a private channel, invite the bot first: /invite @BotName in Slack.`
				: raw;
			await this.repo.createLog({
				channel_id: Number(ch.id),
				event_type: 'test',
				payload: { message: 'Test notification' },
				status: 'failed',
				error: msg,
			});
			return { ok: false, error: msg };
		}
	}

	/* ── Logs ─────────────────────────────────────────────────────────────── */

	findRecentLogs(limit?: number) {
		return this.repo.findRecentLogs(limit);
	}

	/* ── Private ─────────────────────────────────────────────────────────── */

	private sanitise(ch: {
		id: bigint;
		name: string;
		type: string;
		slack_bot_token_enc: string | null;
		slack_channel_id: string | null;
		events: string[];
		active: boolean;
		created_at: Date;
		updated_at: Date;
	}) {
		return {
			id: Number(ch.id),
			name: ch.name,
			type: ch.type,
			has_token: !!ch.slack_bot_token_enc,
			slack_channel_id: ch.slack_channel_id,
			events: ch.events,
			active: ch.active,
			created_at: ch.created_at,
			updated_at: ch.updated_at,
		};
	}

        /* ── Inbox ─────────────────────────────────────────────────────────── */

        async getUnreadCount(userId: number): Promise<{ count: number }> {
                const count = await this.repo.countUnread(userId);
                return { count };
        }

        async findInbox(userId: number, opts: { page: number; limit: number; unread?: boolean }) {
                const [items, total] = await this.repo.findForUser(userId, opts);
                return {
                        data: items.map(n => ({ ...n, id: Number(n.id), user_id: Number(n.user_id) })),
                        total,
                        page: opts.page,
                        limit: opts.limit,
                        totalPages: Math.ceil(total / opts.limit),
                };
        }

        async markRead(id: number, userId: number) {
                await this.repo.markRead(id, userId);
                return { ok: true };
        }

        async markAllRead(userId: number) {
                await this.repo.markAllRead(userId);
                return { ok: true };
        }
}
