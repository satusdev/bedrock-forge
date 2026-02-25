import { NotFoundException } from '@nestjs/common';
import { WpService } from './wp.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('WpService', () => {
	let prisma: MockPrisma;
	let service: WpService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new WpService(prisma as unknown as any);
	});

	it('queues wp command for valid project-server', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 3 }]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.runCommand({
			project_server_id: 3,
			command: 'plugin',
			args: ['list'],
		});

		expect(result.status).toBe('queued');
		expect(result.task_id).toBeDefined();
	});

	it('returns site state for valid project-server', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				project_server_id: 3,
				project_name: 'Acme',
				server_name: 'Main',
				environment: 'production',
				wp_version: '6.5',
				wp_update_available: null,
				php_version: '8.2',
				plugins_count: 10,
				plugins_update_count: 1,
				themes_count: 2,
				themes_update_count: 0,
				users_count: 4,
				last_scanned_at: new Date(),
				scan_error: null,
			},
		]);

		const result = await service.getSiteState(3);
		expect(result.environment).toBe('production');
		expect(result.plugins_count).toBe(10);
	});

	it('queues a wp scan when project-server exists', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 3 }]);

		const result = await service.triggerSiteScan(3);
		expect(result).toEqual({ status: 'queued', message: 'WP scan queued' });
	});

	it('throws when project-server is missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(
			service.runCommand({
				project_server_id: 999,
				command: 'plugin',
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('returns bulk update queue payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

		const result = await service.triggerBulkUpdate({
			update_type: 'core',
			project_server_ids: [1, 2],
		});

		expect(result.sites_queued).toBe(2);
		expect(result.task_id).toBeDefined();
	});

	it('returns pending updates summary payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				project_server_id: 3,
				project_name: 'Acme',
				server_name: 'Main',
				environment: 'production',
				wp_version: '6.5',
				wp_update_available: '6.6',
				php_version: '8.2',
				plugins_count: 10,
				plugins_update_count: 1,
				themes_count: 2,
				themes_update_count: 0,
				users_count: 4,
				last_scanned_at: new Date(),
				scan_error: null,
			},
		]);

		const result = await service.getPendingUpdates();
		expect(result.total_sites).toBe(1);
		expect(result.total_updates).toBe(1);
		expect(result.sites_with_updates).toBe(1);
	});

	it('returns update history payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				project_server_id: 3,
				update_type: 'core',
				package_name: 'wordpress',
				from_version: '6.5',
				to_version: '6.6',
				status: 'success',
				applied_at: new Date(),
				error_message: null,
				created_at: new Date(),
			},
		]);

		const result = await service.getUpdateHistory(3, 25);
		expect(result.total).toBe(1);
		expect(result.updates[0]?.project_server_id).toBe(3);
	});
});
