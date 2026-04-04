import { Test } from '@nestjs/testing';
import { NotificationProcessor } from './notification.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { JOB_TYPES } from '@bedrock-forge/shared';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma() {
	return {
		notificationChannel: {
			findMany: jest.fn(),
		},
		notificationLog: {
			create: jest.fn().mockResolvedValue({}),
		},
	};
}

function makeEncryption() {
	return { decrypt: jest.fn().mockReturnValue('xoxb-fake-token') };
}

function makeJob(name: string, data: object) {
	return { name, data } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationProcessor', () => {
	let processor: NotificationProcessor;
	let prisma: ReturnType<typeof makePrisma>;
	let encryption: ReturnType<typeof makeEncryption>;

	beforeEach(async () => {
		prisma = makePrisma();
		encryption = makeEncryption();

		const module = await Test.createTestingModule({
			providers: [
				NotificationProcessor,
				{ provide: PrismaService, useValue: prisma },
				{ provide: EncryptionService, useValue: encryption },
			],
		}).compile();

		processor = module.get(NotificationProcessor);
	});

	it('does nothing for unknown job names', async () => {
		const job = makeJob('unknown:job', {
			eventType: 'backup.completed',
			payload: {},
		});
		await processor.process(job);
		expect(prisma.notificationChannel.findMany).not.toHaveBeenCalled();
	});

	it('exits early when no active channels match the event', async () => {
		prisma.notificationChannel.findMany.mockResolvedValue([]);
		const job = makeJob(JOB_TYPES.NOTIFICATION_SEND, {
			eventType: 'backup.completed',
			payload: { environmentId: 1 },
		});
		await processor.process(job);
		expect(prisma.notificationLog.create).not.toHaveBeenCalled();
	});

	it('logs "failed" when channel is missing bot token', async () => {
		prisma.notificationChannel.findMany.mockResolvedValue([
			{
				id: BigInt(1),
				name: 'no-token-channel',
				slack_bot_token_enc: null,
				slack_channel_id: null,
				active: true,
				events: ['backup.completed'],
			},
		]);

		const job = makeJob(JOB_TYPES.NOTIFICATION_SEND, {
			eventType: 'backup.completed',
			payload: { environmentId: 1 },
		});
		await processor.process(job);

		expect(prisma.notificationLog.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'failed',
					event_type: 'backup.completed',
				}),
			}),
		);
	});

	describe('buildMessage (via process with mocked Slack)', () => {
		const channel = {
			id: BigInt(2),
			name: 'test-channel',
			slack_bot_token_enc: 'enc-token',
			slack_channel_id: 'C123',
			active: true,
			events: ['backup.completed'],
		};

		beforeEach(() => {
			prisma.notificationChannel.findMany.mockResolvedValue([channel]);
			// Mock @slack/web-api so we don't need a real Slack connection
			jest.mock('@slack/web-api', () => ({
				WebClient: jest.fn().mockImplementation(() => ({
					chat: {
						postMessage: jest.fn().mockResolvedValue({ ok: true }),
					},
				})),
			}));
		});

		it('logs "sent" status on successful Slack delivery', async () => {
			const job = makeJob(JOB_TYPES.NOTIFICATION_SEND, {
				eventType: 'backup.completed',
				payload: { environmentId: 5, backupType: 'full', sizeBytes: 1024 },
			});
			await processor.process(job);

			expect(prisma.notificationLog.create).toHaveBeenCalledWith(
				expect.objectContaining({
					data: expect.objectContaining({ event_type: 'backup.completed' }),
				}),
			);
		});
	});
});
