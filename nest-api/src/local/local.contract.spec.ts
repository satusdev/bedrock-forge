import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { LocalController } from './local.controller';
import { LocalService } from './local.service';

describe('Local HTTP Contract', () => {
	let app: INestApplication;
	const localService = {
		checkLocalAvailability: jest.fn(),
		getBaseDirectory: jest.fn(),
		ensureBaseDirectory: jest.fn(),
		discoverLocalProjects: jest.fn(),
		importDiscoveredProject: jest.fn(),
		runComposerUpdate: jest.fn(),
		runComposerInstall: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [LocalController],
			providers: [{ provide: LocalService, useValue: localService }],
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

	it('POST /local/projects/:name/composer/update returns command result', async () => {
		localService.runComposerUpdate.mockResolvedValueOnce({ status: 'success' });

		const response = await request(app.getHttpServer())
			.post('/local/projects/acme/composer/update')
			.expect(201);

		expect(response.body.status).toBe('success');
	});

	it('GET /local/available returns tool availability payload', async () => {
		localService.checkLocalAvailability.mockResolvedValueOnce({
			ddev_installed: true,
			docker_installed: true,
			git_installed: true,
			base_directory: '/tmp',
			base_directory_exists: true,
		});

		const response = await request(app.getHttpServer())
			.get('/local/available')
			.expect(200);

		expect(response.body.ddev_installed).toBe(true);
	});

	it('GET /local/base-directory returns base dir payload', async () => {
		localService.getBaseDirectory.mockResolvedValueOnce({
			base_directory: '/tmp',
			exists: true,
		});

		const response = await request(app.getHttpServer())
			.get('/local/base-directory')
			.expect(200);

		expect(response.body.exists).toBe(true);
	});

	it('POST /local/base-directory/ensure returns ensure payload', async () => {
		localService.ensureBaseDirectory.mockResolvedValueOnce({
			status: 'exists',
			base_directory: '/tmp',
		});

		const response = await request(app.getHttpServer())
			.post('/local/base-directory/ensure')
			.expect(201);

		expect(response.body.status).toBe('exists');
	});

	it('GET /local/discover returns discovery payload', async () => {
		localService.discoverLocalProjects.mockResolvedValueOnce({
			discovered: [],
			tracked_count: 0,
		});

		const response = await request(app.getHttpServer())
			.get('/local/discover')
			.expect(200);

		expect(response.body.tracked_count).toBe(0);
	});

	it('POST /local/import/:name returns import payload', async () => {
		localService.importDiscoveredProject.mockResolvedValueOnce({
			status: 'imported',
			project_name: 'acme',
		});

		const response = await request(app.getHttpServer())
			.post('/local/import/acme')
			.expect(201);

		expect(response.body.status).toBe('imported');
	});

	it('POST /local/projects/:name/composer/install returns command result', async () => {
		localService.runComposerInstall.mockResolvedValueOnce({
			status: 'success',
		});

		const response = await request(app.getHttpServer())
			.post('/local/projects/acme/composer/install')
			.expect(201);

		expect(response.body.status).toBe('success');
	});
});
