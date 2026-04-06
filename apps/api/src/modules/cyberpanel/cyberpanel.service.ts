import {
	Injectable,
	NotFoundException,
	BadRequestException,
	Logger,
} from '@nestjs/common';
import { request as httpsRequest, RequestOptions } from 'node:https';
import { request as httpRequest } from 'node:http';
import { CyberpanelRepository } from './cyberpanel.repository';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { UpsertCyberpanelDto } from './dto/cyberpanel.dto';

interface CpCredentials {
	url: string;
	username: string;
	password: string;
}

@Injectable()
export class CyberpanelService {
	private readonly logger = new Logger(CyberpanelService.name);

	constructor(
		private readonly repo: CyberpanelRepository,
		private readonly enc: EncryptionService,
	) {}

	async getCredentials(serverId: number) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);
		if (!server.cyberpanel_login)
			throw new BadRequestException(
				'No CyberPanel credentials stored for this server',
			);

		const raw = this.enc.decrypt(server.cyberpanel_login as string);
		return JSON.parse(raw) as Record<string, unknown>;
	}

	async saveCredentials(serverId: number, dto: UpsertCyberpanelDto) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		const encrypted = this.enc.encrypt(
			JSON.stringify({
				url: dto.url,
				username: dto.username,
				password: dto.password,
			}),
		);
		await this.repo.saveCyberpanelLogin(BigInt(serverId), encrypted);
		return { success: true };
	}

	// ── CyberPanel REST API calls ────────────────────────────────────────────

	/**
	 * Create a website in CyberPanel.
	 * Throws if CyberPanel returns an error or if credentials are missing.
	 */
	async createWebsite(
		serverId: number,
		opts: {
			domainName: string;
			adminEmail: string;
			phpVersion?: string;
		},
	): Promise<void> {
		await this.callApi(serverId, 'createWebsite', {
			domainName: opts.domainName,
			email: opts.adminEmail,
			phpSelection: opts.phpVersion ?? 'PHP 8.3',
			package: 'Default',
			websiteOwner: 'admin',
			ssl: 0,
			dkim: 0,
			openBasedir: 0,
		});
	}

	/**
	 * Create a MySQL database in CyberPanel for a specific website.
	 */
	async createDatabase(
		serverId: number,
		opts: {
			databaseWebsite: string;
			dbName: string;
			dbUser: string;
			dbPassword: string;
		},
	): Promise<void> {
		await this.callApi(serverId, 'submitDBCreation', {
			databaseWebsite: opts.databaseWebsite,
			dbName: opts.dbName,
			dbUser: opts.dbUser,
			dbPassword: opts.dbPassword,
		});
	}

	/**
	 * Delete a website from CyberPanel (used for rollback on job failure).
	 * Non-throwing — logs errors but does not re-throw.
	 */
	async deleteWebsite(serverId: number, domainName: string): Promise<void> {
		try {
			await this.callApi(serverId, 'deleteWebsite', {
				domainName,
				adminEmail: '',
			});
		} catch (err) {
			this.logger.warn(
				`CyberPanel rollback deleteWebsite "${domainName}" failed: ${err}`,
			);
		}
	}

	/**
	 * Resolves stored CyberPanel credentials for a server.
	 * Used internally by API methods above.
	 */
	async resolveCredentials(serverId: number): Promise<CpCredentials> {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);
		if (!server.cyberpanel_login)
			throw new BadRequestException(
				`Server ${serverId} has no CyberPanel credentials`,
			);
		const raw = this.enc.decrypt(server.cyberpanel_login as string);
		return JSON.parse(raw) as CpCredentials;
	}

	// ── private ──────────────────────────────────────────────────────────────

	private async callApi(
		serverId: number,
		endpoint: string,
		body: Record<string, unknown>,
	): Promise<unknown> {
		const creds = await this.resolveCredentials(serverId);
		const base = creds.url.replace(/\/$/, '');
		const url = `${base}/api/${endpoint}`;

		const payload = {
			adminUser: creds.username,
			adminPass: creds.password,
			...body,
		};

		const serialized = JSON.stringify(payload);
		const parsedUrl = new URL(url);
		const isHttps = parsedUrl.protocol === 'https:';

		const result = await new Promise<Record<string, unknown>>(
			(resolve, reject) => {
				const opts: RequestOptions = {
					hostname: parsedUrl.hostname,
					port: parsedUrl.port ? parseInt(parsedUrl.port) : isHttps ? 443 : 80,
					path: parsedUrl.pathname + parsedUrl.search,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(serialized),
					},
					rejectUnauthorized: false,
				};
				const req = isHttps
					? httpsRequest(opts, handler)
					: httpRequest(opts, handler);
				function handler(res: import('node:http').IncomingMessage) {
					const chunks: Buffer[] = [];
					res.on('data', (c: Buffer) => chunks.push(c));
					res.on('end', () => {
						try {
							resolve(
								JSON.parse(Buffer.concat(chunks).toString()) as Record<
									string,
									unknown
								>,
							);
						} catch (e) {
							reject(
								new BadRequestException(
									`CyberPanel ${endpoint} parse error: ${e}`,
								),
							);
						}
					});
				}
				req.on('error', (e: Error) =>
					reject(
						new BadRequestException(
							`CyberPanel ${endpoint} request failed: ${e.message}`,
						),
					),
				);
				req.write(serialized);
				req.end();
			},
		);

		// CyberPanel returns { status: 1, ... } on success, { status: 0, error_message: "..." } on failure
		const status = result['status'] ?? result['errorMessage'];
		if (status === 0 || (typeof status === 'string' && status !== '')) {
			const msg =
				(result['error_message'] as string) ??
				(result['errorMessage'] as string) ??
				`CyberPanel ${endpoint} failed`;
			throw new BadRequestException(msg);
		}

		return result;
	}
}
