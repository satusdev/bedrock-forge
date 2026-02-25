import {
	BadRequestException,
	INestApplication,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

describe('Packages HTTP Contract', () => {
	let app: INestApplication;
	const packagesService = {
		listPackages: jest.fn(),
		getPackage: jest.fn(),
		createPackage: jest.fn(),
		updatePackage: jest.fn(),
		deactivatePackage: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [PackagesController],
			providers: [{ provide: PackagesService, useValue: packagesService }],
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

	it('GET /packages returns package list payload', async () => {
		packagesService.listPackages.mockResolvedValueOnce({
			packages: [{ id: 1, name: 'Starter' }],
		});
		const response = await request(app.getHttpServer())
			.get('/packages')
			.expect(200);
		expect(response.body.packages[0].name).toBe('Starter');
	});

	it('POST /packages returns 400 detail on duplicate slug', async () => {
		packagesService.createPackage.mockRejectedValueOnce(
			new BadRequestException({
				detail: 'Package with this slug already exists',
			}),
		);
		const response = await request(app.getHttpServer())
			.post('/packages')
			.send({ name: 'Starter', slug: 'starter' })
			.expect(400);
		expect(response.body.detail).toContain('slug');
	});

	it('GET /packages/:id returns 404 detail when missing', async () => {
		packagesService.getPackage.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Package not found' }),
		);
		const response = await request(app.getHttpServer())
			.get('/packages/999')
			.expect(404);
		expect(response.body).toEqual({ detail: 'Package not found' });
	});
});
