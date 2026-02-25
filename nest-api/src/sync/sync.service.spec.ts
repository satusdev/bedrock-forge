import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { TaskStatusService } from '../task-status/task-status.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
};

describe('SyncService', () => {
	let prisma: MockPrisma;
	let service: SyncService;
	let taskStatusService: TaskStatusService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn() };
		taskStatusService = new TaskStatusService();
		service = new SyncService(prisma as unknown as any, taskStatusService);
	});

	it('returns accepted payload for database pull', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				project_id: 10,
				environment: 'production',
				wp_url: 'https://acme.test',
				wp_path: '/var/www/html',
				server_id: 5,
				server_name: 'Main',
				panel_type: 'cyberpanel',
			},
		]);

		const result = await service.pullDatabase({ source_project_server_id: 1 });
		expect(result.status).toBe('accepted');
		expect(result.sync_method).toBe('ssh_mysql');
	});

	it('returns accepted payload for full sync', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 1,
					project_id: 10,
					environment: 'production',
					wp_url: 'https://acme.test',
					wp_path: '/var/www/html',
					server_id: 5,
					server_name: 'Main',
					panel_type: 'none',
				},
			])
			.mockResolvedValueOnce([
				{
					id: 2,
					project_id: 10,
					environment: 'staging',
					wp_url: 'https://staging.acme.test',
					wp_path: '/var/www/html',
					server_id: 7,
					server_name: 'Staging',
					panel_type: 'none',
				},
			]);

		const result = await service.fullSync({
			source_project_server_id: 1,
			target_project_server_id: 2,
		});
		expect(result.status).toBe('accepted');
		expect(result.target).toBe('Staging');
	});

	it('throws when project-server is missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
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
});
