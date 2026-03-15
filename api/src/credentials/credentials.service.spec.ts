import { NotFoundException } from '@nestjs/common';
import { CredentialsService } from './credentials.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('CredentialsService', () => {
	let prisma: MockPrisma;
	let service: CredentialsService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new CredentialsService(prisma as unknown as any);
	});

	it('lists credentials for project-server', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 2, wp_url: 'https://acme.test' }])
			.mockResolvedValueOnce([
				{
					id: 1,
					project_server_id: 2,
					label: 'Admin',
					username_encrypted: 'admin',
					password_encrypted: 'secret',
					status: 'ACTIVE',
					notes: null,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);

		const result = await service.listCredentials(2);
		expect(result[0]?.label).toBe('Admin');
	});

	it('creates credential', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 2, wp_url: 'https://acme.test' }])
			.mockResolvedValueOnce([{ id: 5 }])
			.mockResolvedValueOnce([
				{
					id: 5,
					project_server_id: 2,
					label: 'Admin',
					username_encrypted: 'admin',
					password_encrypted: 'secret',
					status: 'ACTIVE',
					notes: null,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);

		const result = await service.createCredential(2, {
			username: 'admin',
			password: 'secret',
		});
		expect(result.id).toBe(5);
	});

	it('throws for missing credential', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getCredential(2, 999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('validates autologin token flow', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 2, wp_url: 'https://acme.test' }])
			.mockResolvedValueOnce([
				{
					id: 1,
					project_server_id: 2,
					label: 'Admin',
					username_encrypted: 'admin',
					password_encrypted: 'secret',
					status: 'ACTIVE',
					notes: null,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);

		const tokenPayload = await service.generateQuickLogin(2, 1, {
			method: 'auto',
		});
		const token = tokenPayload.token as string;
		const valid = service.validateAutologinToken(token);
		expect(valid.valid).toBe(true);
	});
});
