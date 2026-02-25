import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { GdriveService } from './gdrive.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
};

jest.mock('fs', () => ({
	existsSync: jest.fn(),
}));

jest.mock('fs/promises', () => ({
	readFile: jest.fn(),
	stat: jest.fn(),
}));

describe('GdriveService', () => {
	let prisma: MockPrisma;
	let service: GdriveService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn() };
		service = new GdriveService(prisma as unknown as any);
		jest.clearAllMocks();
	});

	it('returns status for configured remote', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ value: 'gdrive', encrypted_value: null }])
			.mockResolvedValueOnce([
				{ value: 'WebDev/Projects', encrypted_value: null },
			]);
		(existsSync as jest.Mock).mockReturnValueOnce(true);
		(stat as jest.Mock).mockResolvedValueOnce({ isDirectory: () => false });
		(readFile as jest.Mock).mockResolvedValueOnce('[gdrive]\ntype = drive\n');

		const result = await service.getStatus();

		expect(result.configured).toBe(true);
		expect(result.remote_name).toBe('gdrive');
		expect(result.base_path).toBe('WebDev/Projects');
	});

	it('returns storage usage payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				total_size_bytes: BigInt(1024),
				backups_count: BigInt(3),
				last_backup_at: null,
			},
		]);

		const result = await service.getStorageUsage();
		expect(result.storage_usage.total_size_bytes).toBe(1024);
		expect(result.storage_usage.backups_count).toBe(3);
	});

	it('returns filtered folder list', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ value: 'gdrive', encrypted_value: null }])
			.mockResolvedValueOnce([
				{ value: 'WebDev/Projects', encrypted_value: null },
			])
			.mockResolvedValueOnce([
				{
					name: 'Acme',
					gdrive_folder_id: null,
					gdrive_backups_folder_id: 'WebDev/Projects/Acme/Backups',
					gdrive_assets_folder_id: null,
					gdrive_docs_folder_id: null,
				},
			]);

		const result = await service.listFolders({
			query: 'acme',
			max_results: 20,
		});
		expect(result.remote_name).toBe('gdrive');
		expect(result.folders.length).toBeGreaterThan(0);
		expect(result.folders[0]?.path.toLowerCase()).toContain('acme');
	});
});
