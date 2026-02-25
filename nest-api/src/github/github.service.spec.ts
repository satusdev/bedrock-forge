import { BadRequestException } from '@nestjs/common';
import { GithubService } from './github.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('GithubService', () => {
	let prisma: MockPrisma;
	let service: GithubService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new GithubService(prisma as unknown as any);
	});

	it('returns unauthenticated state when no token exists', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		const result = await service.getAuthStatus();
		expect(result.authenticated).toBe(false);
		expect(result.available).toBe(true);
	});

	it('rejects auth when payload has neither token nor code', async () => {
		await expect(service.authenticate({})).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it('returns repository metadata from github URL', () => {
		const result = service.getRepositoryInfo('https://github.com/acme/repo');
		expect(result.full_name).toBe('acme/repo');
	});

	it('returns project pull/status/integration payloads', () => {
		const pull = service.pullProjectChanges('acme-site');
		const status = service.getProjectStatus('acme-site');
		const integration = service.updateProjectIntegration('acme-site', {
			repository_url: 'https://github.com/acme/repo',
		});

		expect(pull.status).toBe('accepted');
		expect(status.project_name).toBe('acme-site');
		expect(integration.status).toBe('success');
	});
});
