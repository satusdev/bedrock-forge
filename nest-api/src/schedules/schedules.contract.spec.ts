import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

describe('Schedules HTTP Contract', () => {
	let app: INestApplication;
	const schedulesService = {
		listSchedules: jest.fn(),
		getSchedule: jest.fn(),
		createSchedule: jest.fn(),
		updateSchedule: jest.fn(),
		deleteSchedule: jest.fn(),
		pauseSchedule: jest.fn(),
		resumeSchedule: jest.fn(),
		runScheduleNow: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [SchedulesController],
			providers: [
				{ provide: SchedulesService, useValue: schedulesService },
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

	it('GET /schedules returns list payload', async () => {
		schedulesService.listSchedules.mockResolvedValueOnce([
			{ id: 1, name: 'Daily' },
		]);

		const response = await request(app.getHttpServer())
			.get('/schedules?project_id=1&status=active&page=1&page_size=10')
			.expect(200);

		expect(response.body[0].name).toBe('Daily');
	});

	it('GET /schedules/:id returns 404 detail when missing', async () => {
		schedulesService.getSchedule.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Schedule not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/schedules/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Schedule not found' });
	});

	it('POST /schedules returns created schedule', async () => {
		schedulesService.createSchedule.mockResolvedValueOnce({
			id: 2,
			name: 'Nightly',
		});

		const response = await request(app.getHttpServer())
			.post('/schedules')
			.send({ name: 'Nightly', project_id: 1 })
			.expect(201);

		expect(response.body.id).toBe(2);
	});

	it('PATCH /schedules/:id returns updated schedule', async () => {
		schedulesService.updateSchedule.mockResolvedValueOnce({
			id: 2,
			name: 'Nightly Updated',
		});

		const response = await request(app.getHttpServer())
			.patch('/schedules/2')
			.send({ name: 'Nightly Updated' })
			.expect(200);

		expect(response.body.name).toBe('Nightly Updated');
	});

	it('POST /schedules/:id/run returns accepted payload', async () => {
		schedulesService.runScheduleNow.mockResolvedValueOnce({
			task_id: 'task-1',
			status: 'accepted',
			schedule_id: 2,
			message: 'queued',
		});

		const response = await request(app.getHttpServer())
			.post('/schedules/2/run')
			.expect(201);

		expect(response.body.status).toBe('accepted');
	});
});
