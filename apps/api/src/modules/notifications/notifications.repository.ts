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
}
