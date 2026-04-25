import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsRepository {
	constructor(private readonly prisma: PrismaService) {}

	/* ── Channels ─────────────────────────────────────────────────────────── */

	findAllChannels() {
		return this.prisma.notificationChannel.findMany({
			orderBy: { created_at: 'desc' },
		});
	}

	findChannelById(id: number) {
		return this.prisma.notificationChannel.findUnique({
			where: { id: BigInt(id) },
		});
	}

	findActiveChannelsForEvent(eventType: string) {
		return this.prisma.notificationChannel.findMany({
			where: {
				active: true,
				events: { has: eventType },
			},
		});
	}

	createChannel(data: {
		name: string;
		type?: string;
		slack_bot_token_enc?: string | null;
		slack_channel_id?: string | null;
		events: string[];
		active?: boolean;
	}) {
		return this.prisma.notificationChannel.create({
			data: {
				name: data.name,
				type: data.type ?? 'slack',
				slack_bot_token_enc: data.slack_bot_token_enc ?? null,
				slack_channel_id: data.slack_channel_id ?? null,
				events: data.events,
				active: data.active ?? true,
			},
		});
	}

	updateChannel(
		id: number,
		data: {
			name?: string;
			type?: string;
			slack_bot_token_enc?: string | null;
			slack_channel_id?: string | null;
			events?: string[];
			active?: boolean;
		},
	) {
		return this.prisma.notificationChannel.update({
			where: { id: BigInt(id) },
			data,
		});
	}

	removeChannel(id: number) {
		return this.prisma.notificationChannel.delete({
			where: { id: BigInt(id) },
		});
	}

	/* ── Logs ─────────────────────────────────────────────────────────────── */

	findRecentLogs(limit = 50) {
		return this.prisma.notificationLog.findMany({
			include: {
				channel: { select: { id: true, name: true } },
			},
			orderBy: { created_at: 'desc' },
			take: limit,
		});
	}

	createLog(data: {
		channel_id: number;
		event_type: string;
		payload: Record<string, unknown>;
		status: 'sent' | 'failed';
		error?: string;
	}) {
		return this.prisma.notificationLog.create({
			data: {
				channel_id: BigInt(data.channel_id),
				event_type: data.event_type,
				payload:
					data.payload as unknown as import('@prisma/client').Prisma.InputJsonValue,
				status: data.status,
				error: data.error ?? null,
			},
		});
	}

	/* ── Inbox ─────────────────────────────────────────────────────────────── */

	countUnread(userId: number) {
		return this.prisma.userNotification.count({
			where: { user_id: BigInt(userId), is_read: false },
		});
	}

	findForUser(userId: number, opts: { page: number; limit: number; unread?: boolean }) {
		const skip = (opts.page - 1) * opts.limit;
		const where = {
			user_id: BigInt(userId),
			...(opts.unread ? { is_read: false } : {}),
		};
		return Promise.all([
			this.prisma.userNotification.findMany({
				where,
				orderBy: { created_at: 'desc' },
				skip,
				take: opts.limit,
			}),
			this.prisma.userNotification.count({ where }),
		]);
	}

	markRead(id: number, userId: number) {
		return this.prisma.userNotification.updateMany({
			where: { id: BigInt(id), user_id: BigInt(userId) },
			data: { is_read: true },
		});
	}

	markAllRead(userId: number) {
		return this.prisma.userNotification.updateMany({
			where: { user_id: BigInt(userId), is_read: false },
			data: { is_read: true },
		});
	}

	createForUsers(
		userIds: bigint[],
		data: { type: string; title: string; message: string; action_url?: string | null },
	) {
		if (userIds.length === 0) return Promise.resolve({ count: 0 });
		return this.prisma.userNotification.createMany({
			data: userIds.map(id => ({
				user_id: id,
				type: data.type,
				title: data.title,
				message: data.message,
				action_url: data.action_url ?? null,
			})),
		});
	}
}
