import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TaskStatusController } from './task-status.controller';
import { TaskStatusService } from './task-status.service';

describe('TaskStatus HTTP Contract', () => {
	let app: INestApplication;
	const taskStatusService = {
		getTaskStatus: jest.fn(),
		upsertTaskStatus: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [TaskStatusController],
			providers: [{ provide: TaskStatusService, useValue: taskStatusService }],
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

	it('GET /internal/tasks/:taskId returns task status payload', async () => {
		taskStatusService.getTaskStatus.mockReturnValueOnce({
			task_id: 'task-1',
			status: 'pending',
			message: 'Task is queued',
			progress: 0,
			result: null,
			started_at: null,
			completed_at: null,
			updated_at: new Date().toISOString(),
		});

		const response = await request(app.getHttpServer())
			.get('/internal/tasks/task-1')
			.expect(200);

		expect(response.body.task_id).toBe('task-1');
	});

	it('PUT /internal/tasks/:taskId stores status update payload', async () => {
		taskStatusService.upsertTaskStatus.mockReturnValueOnce({
			task_id: 'task-1',
			status: 'running',
			message: 'Processing',
			progress: 35,
			result: null,
			started_at: new Date().toISOString(),
			completed_at: null,
			updated_at: new Date().toISOString(),
		});

		const response = await request(app.getHttpServer())
			.put('/internal/tasks/task-1')
			.send({ status: 'running', message: 'Processing', progress: 35 })
			.expect(200);

		expect(response.body.status).toBe('running');
	});
});
