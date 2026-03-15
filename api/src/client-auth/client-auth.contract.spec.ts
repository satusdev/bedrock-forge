import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';

describe('Client Auth HTTP Contract', () => {
	let app: INestApplication;
	const clientAuthService = {
		login: jest.fn(),
		me: jest.fn(),
		refresh: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [ClientAuthController],
			providers: [
				{
					provide: ClientAuthService,
					useValue: clientAuthService,
				},
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

	it('POST /client/auth/login returns legacy-compatible client token payload', async () => {
		clientAuthService.login.mockResolvedValueOnce({
			access_token: 'access-token',
			token_type: 'bearer',
			client_id: 501,
			client_name: 'Acme Corp',
			role: 'owner',
		});

		const response = await request(app.getHttpServer())
			.post('/client/auth/login')
			.send({ email: 'client@example.com', password: 'ClientPassword123!' })
			.expect(201);

		expect(response.body).toEqual({
			access_token: 'access-token',
			token_type: 'bearer',
			client_id: 501,
			client_name: 'Acme Corp',
			role: 'owner',
		});
	});

	it('GET /client/auth/me returns 401 with missing credentials detail', async () => {
		const response = await request(app.getHttpServer())
			.get('/client/auth/me')
			.expect(401);

		expect(response.body).toEqual({ detail: 'Missing credentials' });
	});

	it('GET /client/auth/me accepts query token and returns client profile', async () => {
		clientAuthService.me.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			full_name: 'Client User',
			client_id: 501,
			client_name: 'Acme Corp',
			company: 'Acme',
			role: 'owner',
		});

		const response = await request(app.getHttpServer())
			.get('/client/auth/me')
			.query({ token: 'query-token' })
			.expect(200);

		expect(response.body.email).toBe('client@example.com');
		expect(clientAuthService.me).toHaveBeenCalledWith('query-token');
	});

	it('POST /client/auth/refresh returns 401 with missing credentials detail', async () => {
		const response = await request(app.getHttpServer())
			.post('/client/auth/refresh')
			.expect(401);

		expect(response.body).toEqual({ detail: 'Missing credentials' });
	});

	it('POST /client/auth/refresh returns refreshed client token payload', async () => {
		clientAuthService.refresh.mockResolvedValueOnce({
			access_token: 'new-access-token',
			token_type: 'bearer',
			client_id: 501,
			client_name: 'Acme Corp',
			role: 'owner',
		});

		const response = await request(app.getHttpServer())
			.post('/client/auth/refresh')
			.set('authorization', 'Bearer refresh-token')
			.expect(201);

		expect(response.body).toEqual({
			access_token: 'new-access-token',
			token_type: 'bearer',
			client_id: 501,
			client_name: 'Acme Corp',
			role: 'owner',
		});
	});

	it('POST /client/auth/logout returns static success message', async () => {
		const response = await request(app.getHttpServer())
			.post('/client/auth/logout')
			.expect(201);

		expect(response.body).toEqual({ message: 'Logged out successfully' });
	});
});
