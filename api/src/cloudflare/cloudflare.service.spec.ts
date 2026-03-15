import { BadRequestException } from '@nestjs/common';
import { CloudflareService } from './cloudflare.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('CloudflareService', () => {
	let prisma: MockPrisma;
	let service: CloudflareService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new CloudflareService(prisma as unknown as any);
	});

	it('returns disconnected status when token is missing', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);

		const result = await service.getStatus();
		expect(result.connected).toBe(false);
		expect(result.zone_count).toBe(0);
	});

	it('rejects listing zones when cloudflare is not connected', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(service.listZones()).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it('returns expiring domains and certs payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{ id: 1, name: 'acme.test', expiry_date: new Date() },
			])
			.mockResolvedValueOnce([
				{ id: 2, common_name: 'acme.test', expiry_date: new Date() },
			]);

		const result = await service.getExpiring(30);
		expect(result.domains).toHaveLength(1);
		expect(result.ssl_certificates).toHaveLength(1);
		expect(result.domains[0]?.name).toBe('acme.test');
		expect(result.ssl_certificates[0]?.common_name).toBe('acme.test');
	});
});
