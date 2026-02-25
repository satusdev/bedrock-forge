import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('Settings HTTP Contract', () => {
	let app: INestApplication;
	const settingsService = {
		getSystemSSHKey: jest.fn(),
		updateSystemSSHKey: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [SettingsController],
			providers: [{ provide: SettingsService, useValue: settingsService }],
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

	it('GET /settings/ssh-key returns key state', async () => {
		settingsService.getSystemSSHKey.mockResolvedValueOnce({
			configured: false,
		});

		const response = await request(app.getHttpServer())
			.get('/settings/ssh-key')
			.expect(200);

		expect(response.body.configured).toBe(false);
	});

	it('PUT /settings/ssh-key returns updated state', async () => {
		settingsService.updateSystemSSHKey.mockResolvedValueOnce({
			configured: true,
			public_key: 'ssh-rsa AAA',
			key_type: 'Configured',
		});

		const response = await request(app.getHttpServer())
			.put('/settings/ssh-key')
			.send({ private_key: 'private-key-value' })
			.expect(200);

		expect(response.body.configured).toBe(true);
	});
});
