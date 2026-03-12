import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { TaskStatusService } from '../task-status/task-status.service';

type MockPrisma = {
	project_servers: {
		findFirst: jest.Mock;
	};
	projects: {
		findFirst: jest.Mock;
	};
};

describe('SyncService', () => {
	let prisma: MockPrisma;
	let service: SyncService;
	let taskStatusService: TaskStatusService;

	beforeEach(() => {
		prisma = {
			project_servers: {
				findFirst: jest.fn(),
			},
			projects: {
				findFirst: jest.fn(),
			},
		};
		taskStatusService = new TaskStatusService();
		service = new SyncService(prisma as unknown as any, taskStatusService);
	});

	it('returns accepted payload for database pull', async () => {
		prisma.project_servers.findFirst.mockResolvedValueOnce({
			id: 1,
			project_id: 10,
			environment: 'production',
			wp_url: 'https://acme.test',
			wp_path: '/var/www/html',
			server_id: 5,
			servers: {
				name: 'Main',
				panel_type: 'cyberpanel',
			},
		});

		const result = await service.pullDatabase({ source_project_server_id: 1 });
		expect(result.status).toBe('accepted');
		expect(result.sync_method).toBe('ssh_mysql');
	});

	it('returns accepted payload for full sync', async () => {
		prisma.project_servers.findFirst
			.mockResolvedValueOnce({
				id: 1,
				project_id: 10,
				environment: 'production',
				wp_url: 'https://acme.test',
				wp_path: '/var/www/html',
				server_id: 5,
				servers: {
					name: 'Main',
					panel_type: 'none',
				},
			})
			.mockResolvedValueOnce({
				id: 2,
				project_id: 10,
				environment: 'staging',
				wp_url: 'https://staging.acme.test',
				wp_path: '/var/www/html',
				server_id: 7,
				servers: {
					name: 'Staging',
					panel_type: 'none',
				},
			});

		const result = await service.fullSync({
			source_project_server_id: 1,
			target_project_server_id: 2,
		});
		expect(result.status).toBe('accepted');
		expect(result.target).toBe('Staging');
	});

	it('throws when project-server is missing', async () => {
		prisma.project_servers.findFirst.mockResolvedValueOnce(null);
		await expect(
			service.pullDatabase({ source_project_server_id: 999 }),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('validates composer command', async () => {
		await expect(
			service.runRemoteComposer({
				project_server_id: 1,
				command: 'invalid-command',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('claims and processes queued sync tasks', async () => {
		prisma.project_servers.findFirst.mockResolvedValueOnce({
			id: 1,
			project_id: 10,
			environment: 'production',
			wp_url: 'https://acme.test',
			wp_path: '/var/www/html',
			server_id: 5,
			servers: {
				name: 'Main',
				panel_type: 'none',
			},
		});

		const created = await service.pullDatabase({ source_project_server_id: 1 });
		const claimed = service.claimPendingTasks(5);
		expect(claimed).toHaveLength(1);

		const processed = await service.processPendingTask(claimed[0] as any);
		expect(processed.status).toBe('completed');

		const status = await service.getStatus(created.task_id);
		expect(status.status).toBe('completed');
	});

	it('returns sync history for an owned project', async () => {
		prisma.projects.findFirst.mockResolvedValueOnce({ id: 10 });
		await taskStatusService.upsertTaskStatus('task-history-1', {
			category: 'sync',
			project_id: 10,
			task_kind: 'sync.full',
			status: 'completed',
			message: 'sync.full task completed',
			progress: 100,
			logs: 'log line',
		});

		const result = await service.getProjectTaskHistory(10);

		expect(result.project_id).toBe(10);
		expect(result.tasks[0]?.task_id).toBe('task-history-1');
	});
});
