import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImportProjectsService } from './import-projects.service';

type MockPrisma = {
	servers: { findFirst: jest.Mock };
	project_servers: {
		findMany: jest.Mock;
		findFirst: jest.Mock;
		create: jest.Mock;
	};
	projects: { findUnique: jest.Mock; create: jest.Mock };
	monitors: { create: jest.Mock };
};

describe('ImportProjectsService', () => {
	let prisma: MockPrisma;
	let service: ImportProjectsService;

	beforeEach(() => {
		prisma = {
			servers: { findFirst: jest.fn() },
			project_servers: {
				findMany: jest.fn(),
				findFirst: jest.fn(),
				create: jest.fn(),
			},
			projects: { findUnique: jest.fn(), create: jest.fn() },
			monitors: { create: jest.fn() },
		};
		service = new ImportProjectsService(prisma as unknown as any);
	});

	it('lists imported websites for a server', async () => {
		prisma.servers.findFirst.mockResolvedValueOnce({ id: 7, name: 'srv-1' });
		prisma.project_servers.findMany.mockResolvedValueOnce([
			{
				project_id: 2,
				environment: 'production',
				wp_url: 'https://acme.test',
				wp_path: '/home/acme.test/public_html',
				projects: { name: 'Acme' },
			},
		]);

		const result = await service.listServerWebsites(7);
		expect(result[0]?.domain).toBe('acme.test');
		expect(result[0]?.already_imported).toBe(true);
	});

	it('imports website and returns success payload', async () => {
		prisma.servers.findFirst.mockResolvedValueOnce({ id: 7, name: 'srv-1' });
		prisma.project_servers.findFirst.mockResolvedValueOnce(null);
		prisma.projects.findUnique.mockResolvedValueOnce(null);
		prisma.projects.create.mockResolvedValueOnce({ id: 9, name: 'Acme' });
		prisma.project_servers.create.mockResolvedValueOnce({ id: 22 });
		prisma.monitors.create.mockResolvedValueOnce({ id: 30 });

		const result = await service.importWebsite(7, {
			domain: 'acme.test',
			environment: 'production',
			create_monitor: true,
		});

		expect(result.success).toBe(true);
		expect(result.project_id).toBe(9);
		expect(prisma.projects.create).toHaveBeenCalledTimes(1);
		expect(prisma.project_servers.create).toHaveBeenCalledTimes(1);
		expect(prisma.monitors.create).toHaveBeenCalledTimes(1);
	});

	it('throws when server is missing', async () => {
		prisma.servers.findFirst.mockResolvedValueOnce(null);

		await expect(service.listServerWebsites(404)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('throws when website is already imported', async () => {
		prisma.servers.findFirst.mockResolvedValueOnce({ id: 7, name: 'srv-1' });
		prisma.project_servers.findFirst.mockResolvedValueOnce({ id: 1 });

		await expect(
			service.importWebsite(7, {
				domain: 'acme.test',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
