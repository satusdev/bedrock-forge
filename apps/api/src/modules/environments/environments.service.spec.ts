import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { EnvironmentsRepository } from './environments.repository';
import { ServersService } from '../servers/servers.service';
import { MonitorsService } from '../monitors/monitors.service';
import { DomainsService } from '../domains/domains.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRepo() {
	return {
		findAll: jest.fn(),
		findByProject: jest.fn(),
		findById: jest.fn(),
		create: jest.fn(),
		update: jest.fn(),
		delete: jest.fn(),
		getDbCredentials: jest.fn(),
		upsertDbCredentials: jest.fn(),
	};
}

function makeServersService() {
	return { scanProjects: jest.fn() };
}

function makeMonitorsService() {
	return { create: jest.fn().mockResolvedValue({}) };
}

function makeDomainsService() {
	return { findOrCreate: jest.fn().mockResolvedValue({}) };
}

function makeEnv(
	overrides: Partial<{
		id: bigint;
		root_path: string;
		url: string;
	}> = {},
) {
	return {
		id: BigInt(1),
		type: 'production',
		url: 'https://example.com',
		root_path: '/var/www/html',
		project_id: BigInt(10),
		server_id: BigInt(5),
		...overrides,
	};
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('EnvironmentsService', () => {
	let svc: EnvironmentsService;
	let repo: ReturnType<typeof makeRepo>;
	let monitorsService: ReturnType<typeof makeMonitorsService>;
	let domainsService: ReturnType<typeof makeDomainsService>;
	let serversService: ReturnType<typeof makeServersService>;

	beforeEach(async () => {
		repo = makeRepo();
		serversService = makeServersService();
		monitorsService = makeMonitorsService();
		domainsService = makeDomainsService();

		const module = await Test.createTestingModule({
			providers: [
				EnvironmentsService,
				{ provide: EnvironmentsRepository, useValue: repo },
				{ provide: ServersService, useValue: serversService },
				{ provide: MonitorsService, useValue: monitorsService },
				{ provide: DomainsService, useValue: domainsService },
			],
		}).compile();

		svc = module.get(EnvironmentsService);
	});

	// ── findOne ──────────────────────────────────────────────────────────────

	describe('findOne', () => {
		it('returns the environment when found', async () => {
			const env = makeEnv();
			repo.findById.mockResolvedValue(env);
			const result = await svc.findOne(1);
			expect(result).toBe(env);
			expect(repo.findById).toHaveBeenCalledWith(BigInt(1));
		});

		it('throws NotFoundException when not found', async () => {
			repo.findById.mockResolvedValue(null);
			await expect(svc.findOne(99)).rejects.toThrow(NotFoundException);
		});
	});

	// ── create ───────────────────────────────────────────────────────────────

	describe('create', () => {
		const baseDto = {
			url: 'https://mysite.com',
			type: 'production' as const,
			root_path: '/var/www/html',
			server_id: 5,
		};

		it('auto-creates a monitor after creating the environment', async () => {
			const env = makeEnv({ id: BigInt(7) });
			repo.create.mockResolvedValue(env);

			await svc.create(10, baseDto);

			expect(monitorsService.create).toHaveBeenCalledWith(
				expect.objectContaining({ environment_id: 7, enabled: true }),
			);
		});

		it('auto-creates a domain record from the URL hostname', async () => {
			const env = makeEnv({ id: BigInt(7) });
			repo.create.mockResolvedValue(env);

			await svc.create(10, { ...baseDto, url: 'https://mysite.com/wp-admin' });

			expect(domainsService.findOrCreate).toHaveBeenCalledWith(
				expect.objectContaining({ name: 'mysite.com', project_id: 10 }),
			);
		});

		it('stores DB credentials when provided', async () => {
			const env = makeEnv({ id: BigInt(7) });
			repo.create.mockResolvedValue(env);
			repo.upsertDbCredentials.mockResolvedValue({});

			const credentials = {
				dbName: 'mydb',
				dbUser: 'user',
				dbPassword: 'pass',
				dbHost: 'localhost',
			};
			await svc.create(10, { ...baseDto, db_credentials: credentials });

			expect(repo.upsertDbCredentials).toHaveBeenCalledWith(
				BigInt(7),
				credentials,
			);
		});

		it('still succeeds when monitor auto-creation fails', async () => {
			const env = makeEnv({ id: BigInt(7) });
			repo.create.mockResolvedValue(env);
			monitorsService.create.mockRejectedValue(
				new Error('Monitor quota exceeded'),
			);

			// Should not throw — error is swallowed with a warning
			await expect(svc.create(10, baseDto)).resolves.toBe(env);
		});

		it('still succeeds when domain auto-creation fails due to invalid URL', async () => {
			const env = makeEnv({ id: BigInt(8) });
			repo.create.mockResolvedValue(env);

			// Invalid URL — new URL() will throw
			await expect(
				svc.create(10, { ...baseDto, url: 'not-a-url' }),
			).resolves.toBe(env);
		});

		it('still succeeds when domain service throws', async () => {
			const env = makeEnv({ id: BigInt(8) });
			repo.create.mockResolvedValue(env);
			domainsService.findOrCreate.mockRejectedValue(
				new Error('Domain conflict'),
			);

			await expect(svc.create(10, baseDto)).resolves.toBe(env);
		});

		it('does not call upsertDbCredentials when dto has no db_credentials', async () => {
			const env = makeEnv({ id: BigInt(9) });
			repo.create.mockResolvedValue(env);

			await svc.create(10, baseDto);

			expect(repo.upsertDbCredentials).not.toHaveBeenCalled();
		});
	});

	// ── update ───────────────────────────────────────────────────────────────

	describe('update', () => {
		it('throws NotFoundException when environment not found', async () => {
			repo.findById.mockResolvedValue(null);
			await expect(svc.update(99, {} as any)).rejects.toThrow(
				NotFoundException,
			);
			expect(repo.update).not.toHaveBeenCalled();
		});

		it('calls repo.update after confirming existence', async () => {
			const env = makeEnv({ id: BigInt(1) });
			repo.findById.mockResolvedValue(env);
			repo.update.mockResolvedValue(env);

			await svc.update(1, { url: 'https://updated.com' } as any);

			expect(repo.update).toHaveBeenCalledWith(BigInt(1), expect.any(Object));
		});
	});

	// ── remove ───────────────────────────────────────────────────────────────

	describe('remove', () => {
		it('throws NotFoundException when environment not found', async () => {
			repo.findById.mockResolvedValue(null);
			await expect(svc.remove(99)).rejects.toThrow(NotFoundException);
			expect(repo.delete).not.toHaveBeenCalled();
		});

		it('calls repo.delete after confirming existence', async () => {
			repo.findById.mockResolvedValue(makeEnv());
			repo.delete.mockResolvedValue(undefined);

			await svc.remove(1);

			expect(repo.delete).toHaveBeenCalledWith(BigInt(1));
		});
	});

	// ── scanServerForNewEnv ──────────────────────────────────────────────────

	describe('scanServerForNewEnv', () => {
		it('marks sites already used in the project as alreadyInThisProject=true', async () => {
			repo.findByProject.mockResolvedValue([
				makeEnv({ root_path: '/existing/path' }),
			]);
			serversService.scanProjects.mockResolvedValue([
				{ serverId: 3, path: '/existing/path', name: 'existing' },
				{ serverId: 3, path: '/new/path', name: 'new' },
			]);

			const results = await svc.scanServerForNewEnv(1, 3);

			expect(results).toHaveLength(2);
			const existing = results.find(r => r.path === '/existing/path');
			const newSite = results.find(r => r.path === '/new/path');
			expect(existing?.alreadyInThisProject).toBe(true);
			expect(newSite?.alreadyInThisProject).toBe(false);
		});

		it('filters out results from other servers', async () => {
			repo.findByProject.mockResolvedValue([]);
			serversService.scanProjects.mockResolvedValue([
				{ serverId: 3, path: '/on-server-3', name: 'site-a' },
				{ serverId: 99, path: '/on-other-server', name: 'site-b' },
			]);

			const results = await svc.scanServerForNewEnv(1, 3);

			expect(results).toHaveLength(1);
			expect(results[0].path).toBe('/on-server-3');
		});
	});
});
