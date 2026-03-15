import {
	BadRequestException,
	INestApplication,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

describe('Backups HTTP Contract', () => {
	let app: INestApplication;
	const backupsService = {
		listBackups: jest.fn(),
		createBackup: jest.fn(),
		runBackup: jest.fn(),
		pullRemoteBackup: jest.fn(),
		scheduleBackup: jest.fn(),
		getBackupSchedule: jest.fn(),
		getBackupStatsSummary: jest.fn(),
		bulkCreateBackups: jest.fn(),
		bulkDeleteBackups: jest.fn(),
		getBackup: jest.fn(),
		deleteBackup: jest.fn(),
		getBackupDownloadMetadata: jest.fn(),
		restoreBackup: jest.fn(),
		restoreBackupRemote: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [BackupsController],
			providers: [
				{ provide: BackupsService, useValue: backupsService },
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

	it('GET /backups returns list envelope', async () => {
		backupsService.listBackups.mockResolvedValueOnce([
			{ id: 1, name: 'Backup 1', status: 'completed' },
		]);

		const response = await request(app.getHttpServer())
			.get('/backups')
			.expect(200);

		expect(response.body[0].name).toBe('Backup 1');
	});

	it('POST /backups returns accepted task payload', async () => {
		backupsService.createBackup.mockResolvedValueOnce({
			task_id: 't1',
			status: 'pending',
			message: 'Creating full backup',
			backup_id: 5,
		});

		const response = await request(app.getHttpServer())
			.post('/backups')
			.send({ project_id: 1 })
			.expect(202);

		expect(response.body.task_id).toBe('t1');
	});

	it('POST /backups/ returns accepted task payload via slash alias', async () => {
		backupsService.createBackup.mockResolvedValueOnce({
			task_id: 't1-slash',
			status: 'pending',
			message: 'Creating full backup',
			backup_id: 6,
		});

		const response = await request(app.getHttpServer())
			.post('/backups/')
			.send({ project_id: 1 })
			.expect(202);

		expect(response.body.task_id).toBe('t1-slash');
	});

	it('POST /backups/remote/pull returns accepted payload', async () => {
		backupsService.pullRemoteBackup.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'pull-1',
		});

		const response = await request(app.getHttpServer())
			.post('/backups/remote/pull')
			.send({ project_server_id: 7 })
			.expect(202);

		expect(response.body.status).toBe('accepted');
	});

	it('POST /backups/schedule returns schedule payload', async () => {
		backupsService.scheduleBackup.mockResolvedValueOnce({
			project_id: 1,
			schedule_type: 'daily',
			enabled: true,
		});

		const response = await request(app.getHttpServer())
			.post('/backups/schedule')
			.send({ project_id: 1 })
			.expect(201);

		expect(response.body.project_id).toBe(1);
	});

	it('GET /backups/schedule/:projectId returns schedule payload', async () => {
		backupsService.getBackupSchedule.mockResolvedValueOnce({
			project_id: 1,
			schedule_type: 'daily',
		});

		const response = await request(app.getHttpServer())
			.get('/backups/schedule/1')
			.expect(200);

		expect(response.body.schedule_type).toBe('daily');
	});

	it('GET /backups/stats/summary returns stats payload', async () => {
		backupsService.getBackupStatsSummary.mockResolvedValueOnce({
			total_backups: 10,
			completed_backups: 8,
			failed_backups: 1,
			pending_backups: 1,
			running_backups: 0,
		});

		const response = await request(app.getHttpServer())
			.get('/backups/stats/summary')
			.expect(200);

		expect(response.body.total_backups).toBe(10);
	});

	it('POST /backups/bulk returns bulk operation payload', async () => {
		backupsService.bulkCreateBackups.mockResolvedValueOnce({
			success: [{ project_id: 1, backup_id: 4, status: 'queued' }],
			failed: [],
			total_requested: 1,
			total_success: 1,
			total_failed: 0,
		});

		const response = await request(app.getHttpServer())
			.post('/backups/bulk')
			.send({ project_ids: [1] })
			.expect(200);

		expect(response.body.total_success).toBe(1);
	});

	it('DELETE /backups/bulk returns bulk delete operation payload', async () => {
		backupsService.bulkDeleteBackups.mockResolvedValueOnce({
			success: [{ backup_id: 7, status: 'deleted' }],
			failed: [],
			total_requested: 1,
			total_success: 1,
			total_failed: 0,
		});

		const response = await request(app.getHttpServer())
			.delete('/backups/bulk')
			.send({ backup_ids: [7], force: true })
			.expect(200);

		expect(response.body.total_success).toBe(1);
	});

	it('GET /backups/:id returns 404 detail when missing', async () => {
		backupsService.getBackup.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Backup not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/backups/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Backup not found' });
	});

	it('DELETE /backups/:id returns 400 detail for running backup', async () => {
		backupsService.deleteBackup.mockRejectedValueOnce(
			new BadRequestException({
				detail: 'Backup is currently running. Use force=true to delete anyway.',
			}),
		);

		const response = await request(app.getHttpServer())
			.delete('/backups/8?delete_file=true')
			.expect(400);

		expect(response.body.detail).toContain('force=true');
		expect(backupsService.deleteBackup).toHaveBeenCalledWith(
			8,
			false,
			undefined,
			true,
		);
	});

	it('POST /backups/:id/restore returns restore task payload', async () => {
		backupsService.restoreBackup.mockResolvedValueOnce({
			task_id: 'restore-1',
			status: 'pending',
			message: 'Restore initiated',
			options: { database: true, files: true },
		});

		const response = await request(app.getHttpServer())
			.post('/backups/10/restore')
			.send({ database: true, files: true })
			.expect(201);

		expect(response.body.task_id).toBe('restore-1');
	});

	it('POST /backups/:id/run returns accepted task payload', async () => {
		backupsService.runBackup.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'run-1',
			backup_id: 10,
		});

		const response = await request(app.getHttpServer())
			.post('/backups/10/run')
			.send({ project_id: 1 })
			.expect(202);

		expect(response.body.status).toBe('accepted');
		expect(response.body.task_id).toBe('run-1');
	});

	it('POST /backups/:id/restore/remote returns accepted task payload', async () => {
		backupsService.restoreBackupRemote.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'restore-remote-1',
			backup_id: 10,
			project_server_id: 7,
		});

		const response = await request(app.getHttpServer())
			.post('/backups/10/restore/remote')
			.send({ project_server_id: 7 })
			.expect(202);

		expect(response.body.status).toBe('accepted');
		expect(response.body.task_id).toBe('restore-remote-1');
	});
});
