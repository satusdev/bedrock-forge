import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { GdriveController } from './gdrive.controller';
import { GdriveService } from './gdrive.service';

describe('GDrive HTTP Contract', () => {
	let app: INestApplication;
	const gdriveService = {
		getStatus: jest.fn(),
		getStorageUsage: jest.fn(),
		listFolders: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [GdriveController],
			providers: [{ provide: GdriveService, useValue: gdriveService }],
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

	it('GET /gdrive/status returns status payload', async () => {
		gdriveService.getStatus.mockResolvedValueOnce({
			configured: true,
			message: 'rclone remote configured',
			remote_name: 'gdrive',
			base_path: 'WebDev/Projects',
			config_path: '/tmp/rclone.conf',
		});

		const response = await request(app.getHttpServer())
			.get('/gdrive/status')
			.expect(200);

		expect(response.body.configured).toBe(true);
		expect(response.body.remote_name).toBe('gdrive');
	});

	it('GET /gdrive/storage returns usage payload', async () => {
		gdriveService.getStorageUsage.mockResolvedValueOnce({
			storage_usage: { total_size_bytes: 1024, backups_count: 2 },
		});

		const response = await request(app.getHttpServer())
			.get('/gdrive/storage')
			.expect(200);

		expect(response.body.storage_usage.total_size_bytes).toBe(1024);
	});

	it('GET /gdrive/folders returns folder list payload', async () => {
		gdriveService.listFolders.mockResolvedValueOnce({
			folders: [{ path: 'WebDev/Projects/Acme', source: 'base' }],
			count: 1,
			remote_name: 'gdrive',
			base_path: 'WebDev/Projects',
		});

		const response = await request(app.getHttpServer())
			.get('/gdrive/folders?query=acme&max_results=20')
			.expect(200);

		expect(response.body.count).toBe(1);
		expect(response.body.folders[0].path).toContain('Acme');
	});
});
