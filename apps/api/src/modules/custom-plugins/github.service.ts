import { Injectable, Logger } from '@nestjs/common';
import { SettingsRepository } from '../settings/settings.repository';

const GITHUB_TOKEN_KEY = 'GITHUB_API_TOKEN';

@Injectable()
export class GithubService {
	private readonly logger = new Logger(GithubService.name);

	constructor(private readonly settings: SettingsRepository) {}

	/**
	 * Returns the latest release tag for a GitHub repository.
	 * Tries /releases/latest first; falls back to /tags if no releases exist.
	 * Returns null if the repo is unreachable, rate-limited, or has no tags.
	 */
	async getLatestTag(repoUrl: string): Promise<string | null> {
		const parsed = this.parseGithubRepo(repoUrl);
		if (!parsed) return null;

		const { owner, repo } = parsed;
		const token = await this.getToken();
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': 'bedrock-forge',
		};
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		try {
			// Try releases/latest first
			const releaseRes = await fetch(
				`https://api.github.com/repos/${owner}/${repo}/releases/latest`,
				{ headers },
			);
			if (releaseRes.ok) {
				const data = (await releaseRes.json()) as { tag_name?: string };
				if (data.tag_name) return data.tag_name;
			}

			// Fall back to /tags
			const tagsRes = await fetch(
				`https://api.github.com/repos/${owner}/${repo}/tags?per_page=1`,
				{ headers },
			);
			if (tagsRes.ok) {
				const tags = (await tagsRes.json()) as { name?: string }[];
				if (Array.isArray(tags) && tags.length > 0 && tags[0].name) {
					return tags[0].name;
				}
			}

			return null;
		} catch (err) {
			this.logger.warn(
				`GitHub API call failed for ${owner}/${repo}: ${err instanceof Error ? err.message : String(err)}`,
			);
			return null;
		}
	}

	private parseGithubRepo(url: string): { owner: string; repo: string } | null {
		// SSH: git@github.com:owner/repo.git
		const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
		if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

		// HTTPS: https://github.com/owner/repo[.git]
		const httpsMatch = url.match(
			/^https:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/,
		);
		if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

		return null;
	}

	private async getToken(): Promise<string | null> {
		try {
			const s = await this.settings.findByKey(GITHUB_TOKEN_KEY);
			return s?.value ?? null;
		} catch {
			return null;
		}
	}
}
