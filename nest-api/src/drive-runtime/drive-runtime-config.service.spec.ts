import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { DriveRuntimeConfigService } from './drive-runtime-config.service';

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

describe('DriveRuntimeConfigService', () => {
	let prisma: MockPrisma;
	let service: DriveRuntimeConfigService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn() };
		service = new DriveRuntimeConfigService(prisma as unknown as any);
		jest.clearAllMocks();
		delete process.env.FORGE_BACKUP_GDRIVE_REMOTE;
		delete process.env.RCLONE_CONFIG;
	});

	it('prefers env remote over app settings', async () => {
		process.env.FORGE_BACKUP_GDRIVE_REMOTE = 'env-drive';
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				key: 'gdrive_rclone_remote',
				value: 'settings-drive',
				encrypted_value: null,
			},
			{
				key: 'gdrive_base_path',
				value: 'WebDev/Projects',
				encrypted_value: null,
			},
		]);

		const config = await service.getRuntimeConfig();

		expect(config.remoteName).toBe('env-drive');
		expect(config.remoteSource).toBe('env');
	});

	it('uses settings remote when env is absent', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				key: 'gdrive_rclone_remote',
				value: 'settings-drive',
				encrypted_value: null,
			},
			{
				key: 'gdrive_base_path',
				value: 'WebDev/Projects/MG',
				encrypted_value: null,
			},
		]);

		const config = await service.getRuntimeConfig();

		expect(config.remoteName).toBe('settings-drive');
		expect(config.remoteSource).toBe('settings');
		expect(config.basePath).toBe('WebDev/Projects/MG');
	});

	it('returns configured=false when config file is missing', async () => {
		const runtime = {
			remoteName: 'gdrive',
			remoteSource: 'default' as const,
			basePath: 'WebDev/Projects',
			configPath: '/tmp/missing-rclone.conf',
		};

		(existsSync as jest.Mock).mockReturnValueOnce(false);

		const result = await service.checkRemoteConfigured(runtime);

		expect(result.configured).toBe(false);
		expect(result.message).toContain('rclone config not found');
	});

	it('returns configured=false when remote section is absent', async () => {
		const runtime = {
			remoteName: 'gdrive',
			remoteSource: 'default' as const,
			basePath: 'WebDev/Projects',
			configPath: '/tmp/rclone.conf',
		};

		(existsSync as jest.Mock).mockReturnValueOnce(true);
		(stat as jest.Mock).mockResolvedValueOnce({ isDirectory: () => false });
		(readFile as jest.Mock).mockResolvedValueOnce('[other]\ntype = drive\n');

		const result = await service.checkRemoteConfigured(runtime);

		expect(result.configured).toBe(false);
		expect(result.message).toContain("Remote 'gdrive' not found");
	});

	it('returns configured=true when remote section exists', async () => {
		const runtime = {
			remoteName: 'gdrive',
			remoteSource: 'default' as const,
			basePath: 'WebDev/Projects',
			configPath: '/tmp/rclone.conf',
		};

		(existsSync as jest.Mock).mockReturnValueOnce(true);
		(stat as jest.Mock).mockResolvedValueOnce({ isDirectory: () => false });
		(readFile as jest.Mock).mockResolvedValueOnce('[gdrive]\ntype = drive\n');

		const result = await service.checkRemoteConfigured(runtime);

		expect(result.configured).toBe(true);
		expect(result.message).toBe('rclone remote configured');
	});
});
