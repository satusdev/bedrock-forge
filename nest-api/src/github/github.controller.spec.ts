import { GithubController } from './github.controller';
import { GithubService } from './github.service';
import { AuthService } from '../auth/auth.service';

describe('GithubController', () => {
	let controller: GithubController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			GithubService,
			| 'getAuthStatus'
			| 'getAuthUrl'
			| 'authenticate'
			| 'disconnect'
			| 'getRepositoryInfo'
			| 'getRepositoryBranches'
			| 'getRepositoryCommits'
			| 'getRepositoryPullRequests'
			| 'getRepositoryDeployments'
			| 'cloneRepository'
			| 'createWebhook'
			| 'getWebhooks'
			| 'createDeployment'
			| 'pullProjectChanges'
			| 'getProjectStatus'
			| 'updateProjectIntegration'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			getAuthStatus: jest.fn(),
			getAuthUrl: jest.fn(),
			authenticate: jest.fn(),
			disconnect: jest.fn(),
			getRepositoryInfo: jest.fn(),
			getRepositoryBranches: jest.fn(),
			getRepositoryCommits: jest.fn(),
			getRepositoryPullRequests: jest.fn(),
			getRepositoryDeployments: jest.fn(),
			cloneRepository: jest.fn(),
			createWebhook: jest.fn(),
			getWebhooks: jest.fn(),
			createDeployment: jest.fn(),
			pullProjectChanges: jest.fn(),
			getProjectStatus: jest.fn(),
			updateProjectIntegration: jest.fn(),
		};
		controller = new GithubController(
			service as unknown as GithubService,
			authService as unknown as AuthService,
		);
	});

	it('delegates auth and repository routes', async () => {
		service.getAuthStatus.mockResolvedValueOnce({
			authenticated: false,
		} as never);
		service.getAuthUrl.mockReturnValueOnce({
			auth_url: 'https://github.com',
		} as never);
		service.authenticate.mockResolvedValueOnce({ status: 'success' } as never);
		service.disconnect.mockResolvedValueOnce({ status: 'success' } as never);
		service.getRepositoryInfo.mockReturnValueOnce({
			full_name: 'acme/repo',
		} as never);
		service.getRepositoryBranches.mockReturnValueOnce({
			branches: [],
		} as never);
		service.getRepositoryCommits.mockReturnValueOnce({ commits: [] } as never);
		service.getRepositoryPullRequests.mockReturnValueOnce({
			pull_requests: [],
		} as never);
		service.getRepositoryDeployments.mockReturnValueOnce({
			deployments: [],
		} as never);
		service.cloneRepository.mockReturnValueOnce({
			status: 'accepted',
		} as never);
		service.createWebhook.mockReturnValueOnce({ status: 'success' } as never);
		service.getWebhooks.mockReturnValueOnce({ webhooks: [] } as never);
		service.createDeployment.mockReturnValueOnce({
			status: 'success',
		} as never);
		service.pullProjectChanges.mockReturnValueOnce({
			status: 'accepted',
		} as never);
		service.getProjectStatus.mockReturnValueOnce({ clean: true } as never);
		service.updateProjectIntegration.mockReturnValueOnce({
			status: 'success',
		} as never);

		await controller.getAuthStatus();
		await controller.getAuthUrl({ redirect_uri: 'https://callback' });
		await controller.authenticate({ token: 'ghp_abc' });
		await controller.disconnect();
		await controller.getRepositoryInfo(
			'https%3A%2F%2Fgithub.com%2Facme%2Frepo',
		);
		await controller.getRepositoryInfoLegacy('https://github.com/acme/repo');
		await controller.getRepositoryBranches(
			'https%3A%2F%2Fgithub.com%2Facme%2Frepo',
		);
		await controller.getRepositoryBranchesLegacy(
			'https://github.com/acme/repo',
		);
		await controller.getRepositoryCommits(
			'https%3A%2F%2Fgithub.com%2Facme%2Frepo',
			{
				branch: 'main',
				limit: 5,
			},
		);
		await controller.getRepositoryCommitsLegacy(
			'https://github.com/acme/repo',
			'main',
			'5',
		);
		await controller.getRepositoryPullRequests(
			'https%3A%2F%2Fgithub.com%2Facme%2Frepo',
			{ state: 'open' },
		);
		await controller.getRepositoryPullRequestsLegacy(
			'https://github.com/acme/repo',
			'open',
		);
		await controller.getRepositoryDeployments(
			'https%3A%2F%2Fgithub.com%2Facme%2Frepo',
			{ environment: 'production' },
		);
		await controller.cloneRepository('https%3A%2F%2Fgithub.com%2Facme%2Frepo', {
			target_path: '/tmp/repo',
		});
		await controller.cloneRepositoryLegacy('https://github.com/acme/repo', {
			target_directory: '/tmp/repo',
			branch: 'main',
		});
		await controller.createWebhook({
			repository_url: 'https://github.com/acme/repo',
			webhook_url: 'https://hooks.local/gh',
		});
		await controller.createWebhookLegacy({
			repository_url: 'https://github.com/acme/repo',
			webhook_url: 'https://hooks.local/gh',
		});
		await controller.getWebhooks('https%3A%2F%2Fgithub.com%2Facme%2Frepo');
		await controller.getWebhooksLegacy('https://github.com/acme/repo');
		await controller.pullProjectChanges('acme-site');
		await controller.getProjectStatus('acme-site');
		await controller.updateProjectIntegration('acme-site', {
			repo_url: 'https://github.com/acme/repo',
		});
		await controller.createDeployment({
			repository_url: 'https://github.com/acme/repo',
			ref: 'main',
			environment: 'production',
		});

		expect(service.getAuthStatus).toHaveBeenCalledWith(undefined);
		expect(service.getAuthUrl).toHaveBeenCalledWith('https://callback');
		expect(service.authenticate).toHaveBeenCalledWith(
			{ token: 'ghp_abc' },
			undefined,
		);
		expect(service.disconnect).toHaveBeenCalledWith(undefined);
	});
});
