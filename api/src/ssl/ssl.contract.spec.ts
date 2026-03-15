import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { SslController } from './ssl.controller';
import { SslService } from './ssl.service';

describe('SSL HTTP Contract', () => {
	let app: INestApplication;
	const sslService = {
		listCertificates: jest.fn(),
		listExpiringCertificates: jest.fn(),
		getSslStats: jest.fn(),
		getCertificate: jest.fn(),
		createCertificate: jest.fn(),
		updateCertificate: jest.fn(),
		deleteCertificate: jest.fn(),
		renewCertificate: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [SslController],
			providers: [
				{ provide: SslService, useValue: sslService },
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

	it('GET /ssl returns list envelope', async () => {
		sslService.listCertificates.mockResolvedValueOnce({
			certificates: [{ id: 1, common_name: 'example.com' }],
			total: 1,
		});

		const response = await request(app.getHttpServer()).get('/ssl').expect(200);
		expect(response.body.total).toBe(1);
	});

	it('GET /ssl/:id returns 404 detail when missing', async () => {
		sslService.getCertificate.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Certificate not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/ssl/999')
			.expect(404);
		expect(response.body).toEqual({ detail: 'Certificate not found' });
	});
});
