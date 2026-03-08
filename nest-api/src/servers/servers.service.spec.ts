import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServersService } from './servers.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('ServersService', () => {
	let prisma: MockPrisma;
	let service: ServersService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
		};
		service = new ServersService(prisma as unknown as any);
	});

	it('lists servers and parses tags/wp paths', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Server A',
				hostname: 'srv-a.test',
				provider: 'custom',
				status: 'online',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: '["/var/www/a"]',
				uploads_path: null,
				tags: '["prod"]',
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.listServers(0, 100);
		expect(result[0]?.tags).toEqual(['prod']);
		expect(result[0]?.wp_root_paths).toEqual(['/var/www/a']);
	});

	it('creates server with defaults', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				id: 2,
				name: 'Server B',
				hostname: 'srv-b.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.createServer({
			name: 'Server B',
			hostname: 'srv-b.test',
		});

		expect(result.id).toBe(2);
		expect(result.status).toBe('offline');
	});

	it('rejects duplicate hostname on create', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);

		await expect(
			service.createServer({
				name: 'Server A',
				hostname: 'srv-a.test',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('returns one server by id', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 3,
				name: 'Server C',
				hostname: 'srv-c.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.getServer(3);
		expect(result.name).toBe('Server C');
	});

	it('throws 404 when server missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getServer(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('updates server and returns refreshed row', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 4,
					name: 'Old',
					hostname: 'old.test',
					provider: 'custom',
					status: 'offline',
					ssh_user: 'root',
					ssh_port: 22,
					ssh_key_path: null,
					ssh_password: null,
					ssh_private_key: null,
					panel_type: 'none',
					panel_url: null,
					panel_username: null,
					panel_password: null,
					panel_verified: false,
					last_health_check: null,
					owner_id: 1,
					wp_root_paths: null,
					uploads_path: null,
					tags: null,
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{
					id: 4,
					name: 'New',
					hostname: 'new.test',
					provider: 'custom',
					status: 'offline',
					ssh_user: 'root',
					ssh_port: 22,
					ssh_key_path: null,
					ssh_password: null,
					ssh_private_key: null,
					panel_type: 'none',
					panel_url: null,
					panel_username: null,
					panel_password: null,
					panel_verified: false,
					last_health_check: null,
					owner_id: 1,
					wp_root_paths: null,
					uploads_path: null,
					tags: null,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.updateServer(4, {
			name: 'New',
			hostname: 'new.test',
		});
		expect(result.name).toBe('New');
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('deletes server after existence check', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 5,
				name: 'Delete Me',
				hostname: 'del.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		await service.deleteServer(5);
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('returns panel login payload when configured', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 7,
				name: 'Panel',
				hostname: 'panel.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'cyberpanel',
				panel_url: 'https://panel.test',
				panel_username: 'admin',
				panel_password: 'secret',
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.getPanelLoginUrl(7);
		expect(result.username).toBe('admin');
		expect(result.login_url).toBe('https://panel.test/');
	});

	it('test connection marks server online', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 8,
				name: 'Check',
				hostname: 'check.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.testServerConnection(8);
		expect(result.success).toBe(true);
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('returns health payload for server', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 81,
				name: 'Health',
				hostname: 'health.test',
				provider: 'custom',
				status: 'online',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: new Date('2025-01-01T00:00:00.000Z'),
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.getHealth(81);
		expect(result.server_id).toBe(81);
		expect(result.status).toBe('online');
	});

	it('triggers health check and returns accepted payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 82,
				name: 'Trigger',
				hostname: 'trigger.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.triggerHealthCheck(82);
		expect(result.status).toBe('accepted');
		expect(result.server_id).toBe(82);
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('updates and returns server tags', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 9,
					name: 'Tags',
					hostname: 'tags.test',
					provider: 'custom',
					status: 'offline',
					ssh_user: 'root',
					ssh_port: 22,
					ssh_key_path: null,
					ssh_password: null,
					ssh_private_key: null,
					panel_type: 'none',
					panel_url: null,
					panel_username: null,
					panel_password: null,
					panel_verified: false,
					last_health_check: null,
					owner_id: 1,
					wp_root_paths: null,
					uploads_path: null,
					tags: null,
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{
					id: 9,
					name: 'Tags',
					hostname: 'tags.test',
					provider: 'custom',
					status: 'offline',
					ssh_user: 'root',
					ssh_port: 22,
					ssh_key_path: null,
					ssh_password: null,
					ssh_private_key: null,
					panel_type: 'none',
					panel_url: null,
					panel_username: null,
					panel_password: null,
					panel_verified: false,
					last_health_check: null,
					owner_id: 1,
					wp_root_paths: null,
					uploads_path: null,
					tags: '["prod"]',
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const updateResult = await service.updateServerTags(9, ['prod', 'Prod']);
		const getResult = await service.getServerTags(9);

		expect(updateResult.tags).toEqual(['prod']);
		expect(getResult.tags).toEqual(['prod']);
	});

	it('returns directories payload from stored wp root paths', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 10,
				name: 'Dirs',
				hostname: 'dirs.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: null,
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: '["/var/www/site"]',
				uploads_path: '/var/www/site/web/app/uploads',
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.getDirectories(10);
		expect(result.directories).toEqual(['/var/www/site']);
		expect(result.uploads_path).toBe('/var/www/site/web/app/uploads');
	});

	it('reads env payload for a given path', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 11,
				name: 'Env',
				hostname: 'env.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: '/tmp/id_rsa',
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		jest.spyOn(service as any, 'isReadableFile').mockResolvedValueOnce(true);
		jest.spyOn(service as any, 'runSshCommand').mockResolvedValueOnce({
			stdout: [
				'DB_NAME=wordpress',
				'DB_USER=forge',
				'WP_HOME="https://acme.example"',
			].join('\n'),
			stderr: '',
		});

		const result = await service.readEnv(11, '/var/www/site');
		expect(result.success).toBe(true);
		expect(result.env.db_name).toBe('wordpress');
		expect(result.env.wp_home).toBe('https://acme.example');
		expect((service as any).runSshCommand).toHaveBeenCalledWith(
			expect.anything(),
			expect.stringContaining('/var/www/.env'),
			'/tmp/id_rsa',
		);
	});

	it('returns explicit error when no env file exists in candidate paths', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 12,
				name: 'Env Missing',
				hostname: 'env-missing.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: '/tmp/id_rsa',
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		jest.spyOn(service as any, 'isReadableFile').mockResolvedValueOnce(true);
		jest.spyOn(service as any, 'runSshCommand').mockResolvedValueOnce({
			stdout: '__FORGE_ENV_NOT_FOUND__\n',
			stderr: '',
		});

		await expect(service.readEnv(12, '/var/www/site')).rejects.toMatchObject({
			response: expect.objectContaining({
				detail: expect.stringContaining(
					'No .env file found in expected locations',
				),
			}),
		});
	});

	it('surfaces SSH stderr detail when command execution fails', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 13,
				name: 'Env Error',
				hostname: 'env-error.test',
				provider: 'custom',
				status: 'offline',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: '/tmp/id_rsa',
				ssh_password: null,
				ssh_private_key: null,
				panel_type: 'none',
				panel_url: null,
				panel_username: null,
				panel_password: null,
				panel_verified: false,
				last_health_check: null,
				owner_id: 1,
				wp_root_paths: null,
				uploads_path: null,
				tags: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		jest.spyOn(service as any, 'isReadableFile').mockResolvedValueOnce(true);
		const sshError = Object.assign(new Error('Command failed'), {
			code: 255,
			stderr: 'Permission denied (publickey).',
		});
		jest.spyOn(service as any, 'runSshCommand').mockRejectedValueOnce(sshError);

		await expect(service.readEnv(13, '/var/www/site')).rejects.toMatchObject({
			response: expect.objectContaining({
				detail: expect.stringContaining(
					'stderr=Permission denied (publickey).',
				),
			}),
		});
	});
});
