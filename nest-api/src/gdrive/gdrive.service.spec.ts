import { GdriveService } from './gdrive.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
};

type MockDriveRuntimeConfigService = {
	getRuntimeConfig: jest.Mock;
	checkRemoteConfigured: jest.Mock;
};

describe('GdriveService', () => {
	let prisma: MockPrisma;
	let service: GdriveService;
	let driveRuntimeConfigService: MockDriveRuntimeConfigService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn() };
		driveRuntimeConfigService = {
			getRuntimeConfig: jest.fn(),
			checkRemoteConfigured: jest.fn(),
		};
		service = new GdriveService(
			prisma as unknown as any,
			driveRuntimeConfigService as unknown as any,
		);
		jest.clearAllMocks();
	});

	it('returns status for configured remote', async () => {
		driveRuntimeConfigService.getRuntimeConfig.mockResolvedValueOnce({
			remoteName: 'gdrive',
			remoteSource: 'default',
			basePath: 'WebDev/Projects',
			configPath: '/tmp/rclone.conf',
		});
		driveRuntimeConfigService.checkRemoteConfigured.mockResolvedValueOnce({
			configured: true,
			message: 'rclone remote configured',
			runtime: {
				remoteName: 'gdrive',
				remoteSource: 'default',
				basePath: 'WebDev/Projects',
				configPath: '/tmp/rclone.conf',
			},
		});

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
		driveRuntimeConfigService.getRuntimeConfig.mockResolvedValueOnce({
			remoteName: 'gdrive',
			remoteSource: 'default',
			basePath: 'WebDev/Projects',
			configPath: '/tmp/rclone.conf',
		});
		driveRuntimeConfigService.checkRemoteConfigured.mockResolvedValueOnce({
			configured: true,
			message: 'rclone remote configured',
			runtime: {
				remoteName: 'gdrive',
				remoteSource: 'default',
				basePath: 'WebDev/Projects',
				configPath: '/tmp/rclone.conf',
			},
		});

		jest
			.spyOn(service as any, 'runRcloneJson')
			.mockResolvedValueOnce([
				{ Name: 'Acme', Path: 'Acme', ID: 'id-acme', IsDir: true },
			])
			.mockResolvedValueOnce([]);

		const result = await service.listFolders({
			query: 'acme',
			max_results: 20,
		});
		expect(result.remote_name).toBe('gdrive');
		expect(result.folders.length).toBeGreaterThan(0);
		expect(result.folders[0]?.display_path?.toLowerCase()).toContain('acme');
	});

	it('returns configured=false payload when remote is unavailable', async () => {
		driveRuntimeConfigService.getRuntimeConfig.mockResolvedValueOnce({
			remoteName: 'gdrive',
			remoteSource: 'default',
			basePath: 'WebDev/Projects',
			configPath: '/tmp/rclone.conf',
		});
		driveRuntimeConfigService.checkRemoteConfigured.mockResolvedValueOnce({
			configured: false,
			message: 'rclone config not found at /tmp/rclone.conf',
			runtime: {
				remoteName: 'gdrive',
				remoteSource: 'default',
				basePath: 'WebDev/Projects',
				configPath: '/tmp/rclone.conf',
			},
		});

		const listFolderSetSpy = jest.spyOn(service as any, 'listFolderSet');

		const result = await service.listFolders({
			shared_with_me: true,
			max_results: 10,
		});

		expect(result.configured).toBe(false);
		expect(result.folders).toEqual([]);
		expect(listFolderSetSpy).not.toHaveBeenCalled();
	});

	it('dedupes matching folders returned from base and shared sets', async () => {
		driveRuntimeConfigService.getRuntimeConfig.mockResolvedValueOnce({
			remoteName: 'gdrive',
			remoteSource: 'default',
			basePath: 'WebDev/Projects',
			configPath: '/tmp/rclone.conf',
		});
		driveRuntimeConfigService.checkRemoteConfigured.mockResolvedValueOnce({
			configured: true,
			message: 'rclone remote configured',
			runtime: {
				remoteName: 'gdrive',
				remoteSource: 'default',
				basePath: 'WebDev/Projects',
				configPath: '/tmp/rclone.conf',
			},
		});

		jest
			.spyOn(service as any, 'listFolderSet')
			.mockResolvedValueOnce([
				{
					id: 'same-folder-id',
					name: 'MG',
					path: 'same-folder-id',
					display_path: 'WebDev/Projects/MG',
					parent_path: 'WebDev/Projects',
					source: 'base',
					drive_type: 'my_drive',
				},
			])
			.mockResolvedValueOnce([
				{
					id: 'same-folder-id',
					name: 'MG Shared',
					path: 'same-folder-id',
					display_path: 'WebDev/Projects/MG',
					parent_path: 'WebDev/Projects',
					source: 'shared',
					drive_type: 'shared_with_me',
				},
			]);

		const result = await service.listFolders({
			query: 'mg',
			shared_with_me: true,
			max_results: 20,
		});

		expect(result.folders).toHaveLength(1);
		expect(result.folders[0]?.id).toBe('same-folder-id');
	});
});
