import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { ImportProjectsController } from './import-projects.controller';
import { ImportProjectsService } from './import-projects.service';

describe('Import Projects HTTP Contract', () => {
	let app: INestApplication;
	const importProjectsService = {
		listServerWebsites: jest.fn(),
		importWebsite: jest.fn(),
		importAllWebsites: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [ImportProjectsController],
			providers: [
				{ provide: ImportProjectsService, useValue: importProjectsService },
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

	it('GET /import-projects/:serverId/websites returns websites payload', async () => {
		importProjectsService.listServerWebsites.mockResolvedValueOnce([
			{ domain: 'acme.test', already_imported: true },
		]);

		const response = await request(app.getHttpServer())
			.get('/import-projects/7/websites')
			.expect(200);

		expect(response.body[0].domain).toBe('acme.test');
	});

	it('POST /import-projects/:serverId/import returns import result payload', async () => {
		importProjectsService.importWebsite.mockResolvedValueOnce({
			success: true,
			project_id: 9,
			project_name: 'Acme',
			message: 'Imported',
			monitor_created: true,
		});

		const response = await request(app.getHttpServer())
			.post('/import-projects/7/import')
			.send({ domain: 'acme.test', environment: 'production' })
			.expect(201);

		expect(response.body.success).toBe(true);
		expect(response.body.project_id).toBe(9);
	});

	it('POST /import-projects/:serverId/import-all returns summary payload', async () => {
		importProjectsService.importAllWebsites.mockResolvedValueOnce({
			total_websites: 2,
			imported: 1,
			skipped: 1,
			results: [],
		});

		const response = await request(app.getHttpServer())
			.post(
				'/import-projects/7/import-all?environment=production&create_monitors=true&wordpress_only=true',
			)
			.expect(201);

		expect(response.body.imported).toBe(1);
	});

	it('GET /import-projects/:serverId/websites returns 404 detail when missing', async () => {
		importProjectsService.listServerWebsites.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Server not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/import-projects/404/websites')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Server not found' });
	});
});
