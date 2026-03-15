import { NotFoundException } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MigrationsService } from './migrations.service';
import { TaskStatusService } from '../task-status/task-status.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('MigrationsService', () => {
	let prisma: MockPrisma;
	let service: MigrationsService;
	let taskStatusService: TaskStatusService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		taskStatusService = new TaskStatusService();
		service = new MigrationsService(
			prisma as unknown as any,
			taskStatusService,
		);
	});

	it('returns accepted URL migration payload', async () => {
		const wpPath = join(tmpdir(), `migration-url-replace-${Date.now()}`);
		await mkdir(wpPath, { recursive: true });
		await writeFile(
			join(wpPath, 'wp-config.php'),
			"define('WP_HOME','https://old.test');",
			'utf-8',
		);

		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 3,
				project_id: 10,
				environment: 'staging',
				wp_path: wpPath,
				project_name: 'Acme',
				project_slug: 'acme',
			},
		]);

		const result = await service.migrateUrlReplace({
			project_server_id: 3,
			source_url: 'https://old.test',
			target_url: 'https://new.test',
			backup_before: false,
			dry_run: true,
		});

		expect(result.status).toBe('accepted');
		expect(result.execution_status).toBe('completed');
		expect(result.project_server_id).toBe(3);

		await rm(wpPath, { recursive: true, force: true });
	});

	it('throws when project is missing for drive clone', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(
			service.cloneFromDrive({
				project_id: 99,
				target_server_id: 2,
				target_domain: 'clone.test',
				environment: 'staging',
				backup_timestamp: '2026-02-18T00:00:00Z',
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});
