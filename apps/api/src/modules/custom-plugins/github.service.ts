import { Injectable, Logger } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";

const GITHUB_TOKEN_KEY = "GITHUB_API_TOKEN";

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(private readonly settings: SettingsService) {}

  /**
   * Returns the latest release tag for a GitHub repository.
   * Tries /releases/latest first; falls back to /tags if no releases exist.
   * If no releases/tags exist, scans repo files for a version comment header.
   * Returns null if the repo is unreachable, rate-limited, or has no tags/version.
   */
  async getLatestTag(
    repoUrl: string,
    repoPath: string = ".",
    type: string = "plugin",
    slug?: string,
  ): Promise<string | null> {
    const parsed = this.parseGithubRepo(repoUrl);
    if (!parsed) return null;

    const { owner, repo } = parsed;
    const token = await this.getToken();
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "bedrock-forge",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
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

      // If no releases or tags, scan repository files at the repoPath
      const cleanPath =
        repoPath === "." || repoPath === "./"
          ? ""
          : repoPath.replace(/^\/|\/$/g, "");
      const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
      const contentsRes = await fetch(contentsUrl, { headers });
      if (contentsRes.ok) {
        const items = (await contentsRes.json()) as {
          name: string;
          type: string;
          path: string;
        }[];
        if (Array.isArray(items)) {
          let fileCandidates: string[] = [];
          if (type === "theme") {
            const styleCss = items.find(
              (item) =>
                item.name.toLowerCase() === "style.css" &&
                item.type === "file",
            );
            if (styleCss) {
              fileCandidates.push(styleCss.path);
            }
          } else {
            // Plugin
            // Look for <slug>.php first
            if (slug) {
              const mainPhp = items.find(
                (item) =>
                  item.type === "file" &&
                  (item.name.toLowerCase() === `${slug.toLowerCase()}.php` ||
                    item.name.toLowerCase() ===
                      `${slug.toLowerCase()}-plugin.php`),
              );
              if (mainPhp) {
                fileCandidates.push(mainPhp.path);
              }
            }
            // Add other .php files in the directory
            const phpFiles = items
              .filter(
                (item) =>
                  item.type === "file" &&
                  item.name.toLowerCase().endsWith(".php") &&
                  !fileCandidates.includes(item.path),
              )
              .map((item) => item.path);
            fileCandidates = fileCandidates.concat(phpFiles);
          }

          // Check first 3 candidates
          for (const filePath of fileCandidates.slice(0, 3)) {
            try {
              const fileRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
                { headers },
              );
              if (fileRes.ok) {
                const fileData = (await fileRes.json()) as {
                  content?: string;
                  encoding?: string;
                };
                if (fileData.content && fileData.encoding === "base64") {
                  const fileContent = Buffer.from(
                    fileData.content,
                    "base64",
                  ).toString("utf-8");
                  const versionMatch = fileContent.match(
                    /Version\s*:\s*([0-9a-zA-Z.-]+)/i,
                  );
                  if (versionMatch && versionMatch[1]) {
                    return versionMatch[1].trim();
                  }
                }
              }
            } catch (fileErr) {
              this.logger.warn(
                `Failed to fetch file content for ${filePath}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`,
              );
            }
          }
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
      return await this.settings.getDecrypted(GITHUB_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}
