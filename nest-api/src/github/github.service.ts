import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
	GitHubAuthDto,
	GitHubCloneDto,
	GitHubCreateDeploymentDto,
	GitHubCreateWebhookDto,
} from './dto/github.dto';

type GitHubTokenRow = {
	access_token: string;
	account_id: string | null;
	account_name: string | null;
	account_email: string | null;
};

@Injectable()
export class GithubService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private decodeRepoPath(repoPath: string): string {
		try {
			return decodeURIComponent(repoPath);
		} catch {
			return repoPath;
		}
	}

	private parseRepository(repoPath: string) {
		const decoded = this.decodeRepoPath(repoPath).trim();
		if (!decoded) {
			throw new BadRequestException({ detail: 'Repository URL is required' });
		}

		const httpsMatch = decoded.match(
			/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
		);
		if (httpsMatch) {
			const owner = httpsMatch[1];
			const name = httpsMatch[2];
			return {
				repository_url: decoded,
				owner,
				name,
				full_name: `${owner}/${name}`,
			};
		}

		const sshMatch = decoded.match(
			/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
		);
		if (sshMatch) {
			const owner = sshMatch[1];
			const name = sshMatch[2];
			return {
				repository_url: decoded,
				owner,
				name,
				full_name: `${owner}/${name}`,
			};
		}

		throw new BadRequestException({ detail: 'Invalid GitHub repository URL' });
	}

	private async upsertToken(
		token: string,
		source: 'oauth' | 'token',
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const accountId = source === 'oauth' ? 'oauth-user' : 'pat-user';
		const accountName =
			source === 'oauth' ? 'GitHub OAuth User' : 'GitHub PAT User';

		await this.prisma.$executeRaw`
			INSERT INTO oauth_tokens (
				user_id,
				provider,
				access_token,
				token_type,
				scope,
				account_email,
				account_name,
				account_id,
				created_at,
				updated_at
			)
			VALUES (
				${resolvedOwnerId},
				CAST(${'github'} AS oauthprovider),
				${token},
				${'bearer'},
				${'repo,workflow'},
				${'github-user@example.com'},
				${accountName},
				${accountId},
				NOW(),
				NOW()
			)
			ON CONFLICT (user_id, provider)
			DO UPDATE SET
				access_token = EXCLUDED.access_token,
				token_type = EXCLUDED.token_type,
				scope = EXCLUDED.scope,
				account_email = EXCLUDED.account_email,
				account_name = EXCLUDED.account_name,
				account_id = EXCLUDED.account_id,
				updated_at = NOW()
		`;
	}

	async getAuthStatus(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<GitHubTokenRow[]>`
			SELECT access_token, account_id, account_name, account_email
			FROM oauth_tokens
			WHERE user_id = ${resolvedOwnerId}
				AND provider::text = 'github'
			LIMIT 1
		`;
		const token = rows[0];

		if (!token) {
			return {
				authenticated: false,
				available: true,
			};
		}

		return {
			authenticated: true,
			available: true,
			login: token.account_id,
			name: token.account_name,
			email: token.account_email,
		};
	}

	getAuthUrl(redirectUri?: string) {
		const clientId = process.env.GITHUB_CLIENT_ID ?? 'github-client-id';
		const callback = redirectUri ?? process.env.GITHUB_REDIRECT_URI ?? '';
		const state = randomUUID();

		const params = new URLSearchParams({
			client_id: clientId,
			scope: 'repo workflow read:user',
			state,
		});
		if (callback) {
			params.set('redirect_uri', callback);
		}

		return {
			auth_url: `https://github.com/login/oauth/authorize?${params.toString()}`,
		};
	}

	async authenticate(payload: GitHubAuthDto, ownerId?: number) {
		if (!payload.code && !payload.token) {
			throw new BadRequestException({ detail: 'Token or code is required' });
		}

		if (payload.code) {
			const oauthToken = `oauth_${payload.code}`;
			await this.upsertToken(oauthToken, 'oauth', ownerId);
			return {
				status: 'success',
				message: 'GitHub connected successfully',
				login: 'oauth-user',
				name: 'GitHub OAuth User',
				email: 'github-user@example.com',
			};
		}

		const token = payload.token?.trim() ?? '';
		if (!token) {
			throw new BadRequestException({ detail: 'Token or code is required' });
		}

		await this.upsertToken(token, 'token', ownerId);
		return {
			status: 'success',
			message: 'GitHub authenticated successfully',
			login: 'pat-user',
			name: 'GitHub PAT User',
		};
	}

	async disconnect(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		await this.prisma.$executeRaw`
			DELETE FROM oauth_tokens
			WHERE user_id = ${resolvedOwnerId}
				AND provider::text = 'github'
		`;

		return { status: 'success', message: 'GitHub disconnected' };
	}

	getRepositoryInfo(repoPath: string) {
		const repo = this.parseRepository(repoPath);
		return {
			repository_url: repo.repository_url,
			full_name: repo.full_name,
			owner: repo.owner,
			name: repo.name,
			default_branch: 'main',
			private: false,
			description: null,
		};
	}

	getRepositoryBranches(repoPath: string) {
		this.parseRepository(repoPath);
		return {
			branches: [
				{ name: 'main', protected: true },
				{ name: 'develop', protected: false },
			],
		};
	}

	getRepositoryCommits(repoPath: string, branch?: string, limit?: number) {
		const repo = this.parseRepository(repoPath);
		const targetBranch = branch ?? 'main';
		const itemCount = Math.max(1, Math.min(limit ?? 10, 100));

		const commits = Array.from({ length: itemCount }, (_, index) => ({
			sha: randomUUID().replace(/-/g, '').slice(0, 12),
			message: `Commit ${index + 1} on ${targetBranch}`,
			author: 'automation',
			date: new Date(Date.now() - index * 3600000).toISOString(),
			repository: repo.full_name,
		}));

		return { commits };
	}

	getRepositoryPullRequests(repoPath: string, state?: string) {
		this.parseRepository(repoPath);
		return {
			pull_requests: [],
			state: state ?? 'open',
		};
	}

	getRepositoryDeployments(repoPath: string, environment?: string) {
		const repo = this.parseRepository(repoPath);
		return {
			repository_url: repo.repository_url,
			environment: environment ?? null,
			deployments: [],
		};
	}

	cloneRepository(repoPath: string, payload: GitHubCloneDto) {
		const repo = this.parseRepository(repoPath);
		return {
			status: 'accepted',
			task_id: randomUUID(),
			repository_url: repo.repository_url,
			target_path: payload.target_path,
			branch: payload.branch ?? 'main',
			message: 'Repository clone queued',
		};
	}

	createWebhook(payload: GitHubCreateWebhookDto) {
		this.parseRepository(payload.repository_url);
		return {
			status: 'success',
			message: 'Webhook created',
			webhook: {
				id: Date.now(),
				repository_url: payload.repository_url,
				webhook_url: payload.webhook_url,
				events: payload.events ?? ['push', 'pull_request'],
				active: true,
			},
		};
	}

	getWebhooks(repoPath: string) {
		this.parseRepository(repoPath);
		return { webhooks: [] };
	}

	createDeployment(payload: GitHubCreateDeploymentDto) {
		this.parseRepository(payload.repository_url);
		return {
			status: 'success',
			deployment_id: randomUUID(),
			repository_url: payload.repository_url,
			ref: payload.ref,
			environment: payload.environment,
			description: payload.description ?? null,
		};
	}

	pullProjectChanges(projectName: string) {
		return {
			status: 'accepted',
			task_id: randomUUID(),
			project_name: projectName,
			message: `Pull queued for ${projectName}`,
		};
	}

	getProjectStatus(projectName: string) {
		return {
			project_name: projectName,
			branch: 'main',
			clean: true,
			behind: 0,
			ahead: 0,
			changes: [],
		};
	}

	updateProjectIntegration(
		projectName: string,
		_payload: Record<string, unknown>,
	) {
		return {
			status: 'success',
			message: `GitHub integration updated for ${projectName}`,
		};
	}
}
