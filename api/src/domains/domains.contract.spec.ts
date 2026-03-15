import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

describe('Domains HTTP Contract', () => {
	let app: INestApplication;
	const domainsService = {
		listDomains: jest.fn(),
		listExpiringDomains: jest.fn(),
		getDomainStats: jest.fn(),
		getDomain: jest.fn(),
		refreshWhois: jest.fn(),
		createDomain: jest.fn(),
		updateDomain: jest.fn(),
		deleteDomain: jest.fn(),
		renewDomain: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [DomainsController],
			providers: [
				{ provide: DomainsService, useValue: domainsService },
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

	it('GET /domains returns list envelope', async () => {
		domainsService.listDomains.mockResolvedValueOnce({
			domains: [{ id: 1, domain_name: 'example.com' }],
			total: 1,
		});

		const response = await request(app.getHttpServer())
			.get('/domains')
			.expect(200);

		expect(response.body.total).toBe(1);
	});

	it('GET /domains/:id returns 404 detail when missing', async () => {
		domainsService.getDomain.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Domain not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/domains/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Domain not found' });
	});
});
