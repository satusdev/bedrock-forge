import {
	BadRequestException,
	INestApplication,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

describe('Sync HTTP Contract', () => {
	let app: INestApplication;
	const syncService = {
		pullDatabase: jest.fn(),
		pushDatabase: jest.fn(),
		pullFiles: jest.fn(),
		pushFiles: jest.fn(),
		getStatus: jest.fn(),
		fullSync: jest.fn(),
		runRemoteComposer: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [SyncController],
			providers: [
				{ provide: SyncService, useValue: syncService },
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

	it('POST /sync/database/pull returns accepted payload', async () => {
		syncService.pullDatabase.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 't1',
		});

		const response = await request(app.getHttpServer())
			.post('/sync/database/pull')
			.send({ source_project_server_id: 1 })
			.expect(201);

		expect(response.body.status).toBe('accepted');
	});

	it('GET /sync/status/:taskId returns status payload', async () => {
		syncService.getStatus.mockResolvedValueOnce({
			task_id: 'task-1',
			status: 'pending',
			progress: 0,
			message: 'Task is waiting to be processed',
		});

		const response = await request(app.getHttpServer())
			.get('/sync/status/task-1')
			.expect(200);

		expect(response.body.task_id).toBe('task-1');
	});

	it('POST /sync/composer returns 400 detail for invalid command', async () => {
		syncService.runRemoteComposer.mockRejectedValueOnce(
			new BadRequestException({
				detail: 'Invalid composer command. Allowed: install, update',
			}),
		);

		const response = await request(app.getHttpServer())
			.post('/sync/composer')
			.send({ project_server_id: 1, command: 'bad' })
			.expect(400);

		expect(response.body.detail).toContain('Invalid composer command');
	});
});
