import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RcloneController } from './rclone.controller';
import { RcloneService } from './rclone.service';

describe('Rclone HTTP Contract', () => {
	let app: INestApplication;
	const rcloneService = {
		listRemotes: jest.fn(),
		authorize: jest.fn(),
		configureS3Remote: jest.fn(),
		deleteRemote: jest.fn(),
		getInstallInstructions: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [RcloneController],
			providers: [{ provide: RcloneService, useValue: rcloneService }],
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

	it('GET /rclone/remotes returns remotes payload', async () => {
		rcloneService.listRemotes.mockResolvedValueOnce({
			remotes: [{ name: 'gdrive' }],
		});

		const response = await request(app.getHttpServer())
			.get('/rclone/remotes')
			.expect(200);

		expect(response.body.remotes[0].name).toBe('gdrive');
	});

	it('POST /rclone/authorize returns configured payload', async () => {
		rcloneService.authorize.mockResolvedValueOnce({ success: true });

		const response = await request(app.getHttpServer())
			.post('/rclone/authorize')
			.send({ token: '{"access_token":"a","refresh_token":"b"}' })
			.expect(201);

		expect(response.body.success).toBe(true);
	});

	it('DELETE /rclone/remotes/:name returns 404 detail when missing', async () => {
		rcloneService.deleteRemote.mockRejectedValueOnce(
			new NotFoundException({ detail: "Remote 'x' not found" }),
		);

		const response = await request(app.getHttpServer())
			.delete('/rclone/remotes/x')
			.expect(404);

		expect(response.body).toEqual({ detail: "Remote 'x' not found" });
	});
});
