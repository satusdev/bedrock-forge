import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { MigrationsController } from './migrations.controller';
import { MigrationsService } from './migrations.service';

describe('Migrations HTTP Contract', () => {
	let app: INestApplication;
	const migrationsService = {
		migrateUrlReplace: jest.fn(),
		cloneFromDrive: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [MigrationsController],
			providers: [
				{ provide: MigrationsService, useValue: migrationsService },
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

	it('POST /migrations/url-replace returns accepted payload', async () => {
		migrationsService.migrateUrlReplace.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'task-1',
		});

		const response = await request(app.getHttpServer())
			.post('/migrations/url-replace')
			.send({
				project_server_id: 1,
				source_url: 'https://old.test',
				target_url: 'https://new.test',
			})
			.expect(202);

		expect(response.body.status).toBe('accepted');
	});

	it('POST /migrations/drive/clone returns accepted payload', async () => {
		migrationsService.cloneFromDrive.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'task-2',
		});

		const response = await request(app.getHttpServer())
			.post('/migrations/drive/clone')
			.send({
				project_id: 1,
				target_server_id: 2,
				target_domain: 'clone.test',
				environment: 'staging',
				backup_timestamp: '2026-02-18T00:00:00Z',
			})
			.expect(202);

		expect(response.body.status).toBe('accepted');
	});

	it('POST /migrations/url-replace returns 404 detail when missing', async () => {
		migrationsService.migrateUrlReplace.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Project-server link not found' }),
		);

		const response = await request(app.getHttpServer())
			.post('/migrations/url-replace')
			.send({
				project_server_id: 99,
				source_url: 'https://old.test',
				target_url: 'https://new.test',
			})
			.expect(404);

		expect(response.body).toEqual({ detail: 'Project-server link not found' });
	});
});
