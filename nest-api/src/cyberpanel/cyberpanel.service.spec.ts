import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CyberpanelService } from './cyberpanel.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('CyberpanelService', () => {
	let prisma: MockPrisma;
	let service: CyberpanelService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new CyberpanelService(prisma as unknown as any);
	});

	it('verifies cyberpanel server connection', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 1, panel_type: 'cyberpanel', panel_verified: false },
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.verify(1);
		expect(result.verified).toBe(true);
	});

	it('creates and lists websites', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{ id: 1, panel_type: 'cyberpanel', panel_verified: true },
			])
			.mockResolvedValueOnce([
				{ id: 1, panel_type: 'cyberpanel', panel_verified: true },
			]);

		await service.createWebsite(1, {
			domain: 'site.test',
			email: 'admin@site.test',
		});
		const list = await service.listWebsites(1);
		expect(list.total).toBe(1);
	});

	it('creates and deletes databases', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{ id: 1, panel_type: 'cyberpanel', panel_verified: true },
			])
			.mockResolvedValueOnce([
				{ id: 1, panel_type: 'cyberpanel', panel_verified: true },
			])
			.mockResolvedValueOnce([
				{ id: 1, panel_type: 'cyberpanel', panel_verified: true },
			]);

		await service.createDatabase(1, {
			domain: 'site.test',
			db_name: 'db1',
			db_user: 'user1',
			db_password: 'password123',
		});
		await service.deleteDatabase(1, 'db1');
		const databases = await service.listDatabases(1);
		expect(databases.total).toBe(0);
	});

	it('throws for missing server', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.verify(999)).rejects.toBeInstanceOf(NotFoundException);
	});

	it('throws for non-cyberpanel server', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 1, panel_type: 'cpanel', panel_verified: false },
		]);
		await expect(service.verify(1)).rejects.toBeInstanceOf(BadRequestException);
	});

	it('supports website stats, php update, wordpress scan, info, packages and acls', async () => {
		prisma.$queryRaw.mockResolvedValue([
			{ id: 1, panel_type: 'cyberpanel', panel_verified: true },
		]);

		await service.createWebsite(1, {
			domain: 'site.test',
			email: 'admin@site.test',
		});
		const stats = await service.getWebsiteStats(1, 'site.test');
		const php = await service.changePhpVersion(1, 'site.test', '8.2');
		const wordpress = await service.scanWordpressSites(1);
		const info = await service.getServerInfo(1);
		const packages = await service.listPackages(1);
		const acls = await service.listAcls(1);

		expect(stats.success).toBe(true);
		expect(php.php_version).toBe('8.2');
		expect(wordpress.total).toBe(1);
		expect(info.success).toBe(true);
		expect(packages.total).toBeGreaterThan(0);
		expect(acls.total).toBeGreaterThan(0);
	});

	it('supports full user lifecycle endpoints', async () => {
		prisma.$queryRaw.mockResolvedValue([
			{ id: 1, panel_type: 'cyberpanel', panel_verified: true },
		]);

		const created = await service.createUser(1, {
			username: 'editor1',
			email: 'editor1@site.test',
			password: 'Password123!',
		});
		expect(created.status).toBe('success');

		const listed = await service.listUsers(1, true);
		expect(listed.total).toBe(1);
		const fetched = await service.getUser(1, 'editor1');
		expect(fetched.username).toBe('editor1');

		const updated = await service.updateUser(1, 'editor1', {
			first_name: 'Editor',
			last_name: 'One',
		});
		expect(updated.status).toBe('success');

		const changed = await service.changeUserPassword(
			1,
			'editor1',
			'Changed123!',
		);
		expect(changed.password).toBe('Changed123!');

		const revealed = await service.revealUserPassword(1, 'editor1');
		expect(revealed.password).toBe('Changed123!');

		await service.suspendUser(1, 'editor1');
		await service.unsuspendUser(1, 'editor1');
		const deleted = await service.deleteUser(1, 'editor1');
		expect(deleted.status).toBe('success');
	});
});
