import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImportProjectsService } from './import-projects.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('ImportProjectsService', () => {
	let prisma: MockPrisma;
	let service: ImportProjectsService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
		};
		service = new ImportProjectsService(prisma as unknown as any);
	});

	it('lists imported websites for a server', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 7, name: 'srv-1' }])
			.mockResolvedValueOnce([
				{
					project_id: 2,
					project_name: 'Acme',
					environment: 'production',
					wp_url: 'https://acme.test',
					wp_path: '/home/acme.test/public_html',
				},
			]);

		const result = await service.listServerWebsites(7);
		expect(result[0]?.domain).toBe('acme.test');
		expect(result[0]?.already_imported).toBe(true);
	});

	it('imports website and returns success payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 7, name: 'srv-1' }])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: 9, name: 'Acme' }]);
		prisma.$executeRaw.mockResolvedValue(1);

		const result = await service.importWebsite(7, {
			domain: 'acme.test',
			environment: 'production',
			create_monitor: true,
		});

		expect(result.success).toBe(true);
		expect(result.project_id).toBe(9);
	});

	it('throws when server is missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(service.listServerWebsites(404)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('throws when website is already imported', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 7, name: 'srv-1' }])
			.mockResolvedValueOnce([{ id: 1 }]);

		await expect(
			service.importWebsite(7, {
				domain: 'acme.test',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
