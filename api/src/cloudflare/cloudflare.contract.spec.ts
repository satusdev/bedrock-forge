import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CloudflareController } from './cloudflare.controller';
import { CloudflareService } from './cloudflare.service';

describe('Cloudflare HTTP Contract', () => {
	let app: INestApplication;
	const cloudflareService = {
		connect: jest.fn(),
		disconnect: jest.fn(),
		getStatus: jest.fn(),
		listZones: jest.fn(),
		sync: jest.fn(),
		getExpiring: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [CloudflareController],
			providers: [{ provide: CloudflareService, useValue: cloudflareService }],
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

	it('GET /cloudflare/status returns status payload', async () => {
		cloudflareService.getStatus.mockResolvedValueOnce({
			connected: true,
			zone_count: 3,
			last_sync: null,
		});

		const response = await request(app.getHttpServer())
			.get('/cloudflare/status')
			.expect(200);

		expect(response.body.connected).toBe(true);
		expect(response.body.zone_count).toBe(3);
	});

	it('POST /cloudflare/sync returns sync payload', async () => {
		cloudflareService.sync.mockResolvedValueOnce({
			domains_synced: 2,
			ssl_synced: 1,
			errors: [],
		});

		const response = await request(app.getHttpServer())
			.post('/cloudflare/sync')
			.expect(201);

		expect(response.body.domains_synced).toBe(2);
	});

	it('GET /cloudflare/zones returns 400 detail when disconnected', async () => {
		cloudflareService.listZones.mockRejectedValueOnce(
			new BadRequestException({ detail: 'Cloudflare not connected' }),
		);

		const response = await request(app.getHttpServer())
			.get('/cloudflare/zones')
			.expect(400);

		expect(response.body).toEqual({ detail: 'Cloudflare not connected' });
	});
});
