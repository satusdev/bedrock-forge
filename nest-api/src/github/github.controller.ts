import {
	Body,
	Controller,
	Get,
	Headers,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import {
	GitHubAuthDto,
	GitHubAuthUrlQueryDto,
	GitHubCloneDto,
	GitHubCommitsQueryDto,
	GitHubCreateDeploymentDto,
	GitHubCreateWebhookDto,
	GitHubDeploymentsQueryDto,
	GitHubPullRequestsQueryDto,
} from './dto/github.dto';
import { GithubService } from './github.service';

@Controller('github')
export class GithubController {
	constructor(
		private readonly githubService: GithubService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get('auth/status')
	async getAuthStatus(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.githubService.getAuthStatus(ownerId);
	}

	@Get('auth/url')
	async getAuthUrl(@Query() query: GitHubAuthUrlQueryDto) {
		return this.githubService.getAuthUrl(query.redirect_uri);
	}

	@Post('auth')
	async authenticate(
		@Body() payload: GitHubAuthDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.githubService.authenticate(payload, ownerId);
	}

	@Post('auth/disconnect')
	async disconnect(@Headers('authorization') authorization?: string) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.githubService.disconnect(ownerId);
	}

	@Get('repository/:repoUrl/info')
	async getRepositoryInfo(@Param('repoUrl') repoUrl: string) {
		return this.githubService.getRepositoryInfo(repoUrl);
	}

	@Get('repos/info')
	async getRepositoryInfoLegacy(@Query('repo_url') repoUrl: string) {
		return this.githubService.getRepositoryInfo(repoUrl);
	}

	@Get('repository/:repoUrl/branches')
	async getRepositoryBranches(@Param('repoUrl') repoUrl: string) {
		return this.githubService.getRepositoryBranches(repoUrl);
	}

	@Get('repos/branches')
	async getRepositoryBranchesLegacy(@Query('repo_url') repoUrl: string) {
		return this.githubService.getRepositoryBranches(repoUrl);
	}

	@Get('repository/:repoUrl/commits')
	async getRepositoryCommits(
		@Param('repoUrl') repoUrl: string,
		@Query() query: GitHubCommitsQueryDto,
	) {
		return this.githubService.getRepositoryCommits(
			repoUrl,
			query.branch,
			query.limit,
		);
	}

	@Get('repos/commits')
	async getRepositoryCommitsLegacy(
		@Query('repo_url') repoUrl: string,
		@Query('branch') branch?: string,
		@Query('limit') limit?: string,
	) {
		return this.githubService.getRepositoryCommits(
			repoUrl,
			branch,
			limit ? Number(limit) : undefined,
		);
	}

	@Get('repository/:repoUrl/pull-requests')
	async getRepositoryPullRequests(
		@Param('repoUrl') repoUrl: string,
		@Query() query: GitHubPullRequestsQueryDto,
	) {
		return this.githubService.getRepositoryPullRequests(repoUrl, query.state);
	}

	@Get('repos/pull-requests')
	async getRepositoryPullRequestsLegacy(
		@Query('repo_url') repoUrl: string,
		@Query('state') state?: string,
	) {
		return this.githubService.getRepositoryPullRequests(repoUrl, state);
	}

	@Get('repository/:repoUrl/deployments')
	async getRepositoryDeployments(
		@Param('repoUrl') repoUrl: string,
		@Query() query: GitHubDeploymentsQueryDto,
	) {
		return this.githubService.getRepositoryDeployments(
			repoUrl,
			query.environment,
		);
	}

	@Post('repository/:repoUrl/clone')
	async cloneRepository(
		@Param('repoUrl') repoUrl: string,
		@Body() payload: GitHubCloneDto,
	) {
		return this.githubService.cloneRepository(repoUrl, payload);
	}

	@Post('repos/clone')
	async cloneRepositoryLegacy(
		@Query('repo_url') repoUrl: string,
		@Body() payload: { target_directory?: string; branch?: string },
	) {
		return this.githubService.cloneRepository(repoUrl, {
			target_path: payload.target_directory ?? '',
			branch: payload.branch,
		});
	}

	@Post('webhook/create')
	async createWebhook(@Body() payload: GitHubCreateWebhookDto) {
		return this.githubService.createWebhook(payload);
	}

	@Post('webhooks')
	async createWebhookLegacy(
		@Body()
		payload: {
			repository_url: string;
			webhook_url: string;
			events?: string[];
		},
	) {
		return this.githubService.createWebhook(payload);
	}

	@Get('webhooks/:repoUrl')
	async getWebhooks(@Param('repoUrl') repoUrl: string) {
		return this.githubService.getWebhooks(repoUrl);
	}

	@Get('webhooks')
	async getWebhooksLegacy(@Query('repo_url') repoUrl: string) {
		return this.githubService.getWebhooks(repoUrl);
	}

	@Post('projects/:projectName/pull')
	async pullProjectChanges(@Param('projectName') projectName: string) {
		return this.githubService.pullProjectChanges(projectName);
	}

	@Get('projects/:projectName/status')
	async getProjectStatus(@Param('projectName') projectName: string) {
		return this.githubService.getProjectStatus(projectName);
	}

	@Put('projects/:projectName/integration')
	async updateProjectIntegration(
		@Param('projectName') projectName: string,
		@Body() payload: Record<string, unknown>,
	) {
		return this.githubService.updateProjectIntegration(projectName, payload);
	}

	@Post('deployment/create')
	async createDeployment(@Body() payload: GitHubCreateDeploymentDto) {
		return this.githubService.createDeployment(payload);
	}
}
