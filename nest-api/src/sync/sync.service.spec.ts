import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { TaskStatusService } from '../task-status/task-status.service';

type MockPrisma = {
	project_servers: {
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

		const processed = service.processPendingTask(claimed[0] as any);
		expect(processed.status).toBe('completed');

		const status = service.getStatus(created.task_id);
		expect(status.status).toBe('completed');
	});
});
