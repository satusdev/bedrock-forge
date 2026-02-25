import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';

describe('Credentials HTTP Contract', () => {
	let app: INestApplication;
	const credentialsService = {
		listCredentials: jest.fn(),
		createCredential: jest.fn(),
		getCredential: jest.fn(),
		updateCredential: jest.fn(),
		deleteCredential: jest.fn(),
		generateQuickLogin: jest.fn(),
		validateQuickLoginToken: jest.fn(),
		validateAutologinToken: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [CredentialsController],
			providers: [
				{ provide: CredentialsService, useValue: credentialsService },
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

	it('GET /credentials/:projectServerId/credentials returns list', async () => {
		credentialsService.listCredentials.mockResolvedValueOnce([
			{ id: 1, label: 'Admin' },
		]);
		const response = await request(app.getHttpServer())
			.get('/credentials/2/credentials')
			.expect(200);
		expect(response.body[0].label).toBe('Admin');
	});

	it('POST quick-login validate returns token validation payload', async () => {
		credentialsService.validateAutologinToken.mockResolvedValueOnce({
			valid: true,
			username: 'admin',
		});
		const response = await request(app.getHttpServer())
			.post('/credentials/quick-login/token123/validate')
			.expect(201);
		expect(response.body.valid).toBe(true);
	});

	it('GET quick-login token returns 404 detail when token missing', async () => {
		credentialsService.validateQuickLoginToken.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Invalid or expired token' }),
		);
		const response = await request(app.getHttpServer())
			.get('/credentials/quick-login/missing')
			.expect(404);
		expect(response.body).toEqual({ detail: 'Invalid or expired token' });
	});
});
