import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('Notifications HTTP Contract', () => {
	let app: INestApplication;
	const notificationsService = {
		getChannels: jest.fn(),
		getChannel: jest.fn(),
		createChannel: jest.fn(),
		updateChannel: jest.fn(),
		deleteChannel: jest.fn(),
		testChannel: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [NotificationsController],
			providers: [
				{ provide: NotificationsService, useValue: notificationsService },
				{ provide: AuthService, useValue: authService },
			],
		}).compile();

		app = moduleRef.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('GET /notifications returns channels list', async () => {
		notificationsService.getChannels.mockResolvedValueOnce([
			{ id: 1, name: 'Slack' },
		]);

		const response = await request(app.getHttpServer())
			.get('/notifications')
			.expect(200);

		expect(response.body[0].name).toBe('Slack');
	});

	it('GET /notifications/:id returns 404 when missing', async () => {
		notificationsService.getChannel.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Notification channel not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/notifications/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Notification channel not found' });
	});
});
