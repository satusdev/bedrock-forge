import { Injectable, NotFoundException } from '@nestjs/common';

import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type CredentialRow = {
	id: number;
	project_server_id: number;
	label: string;
	username_encrypted: string;
	password_encrypted: string;
	status: string;
	notes: string | null;
	created_at: Date;
	updated_at: Date;
};

@Injectable()
export class CredentialsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;
	private readonly quickLoginTokens = new Map<
		string,
		Record<string, unknown>
	>();

	private generateToken(bytes = 32) {
		return randomBytes(bytes).toString('hex');
	}

	private async ensureProjectServer(projectServerId: number, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const rows = await this.prisma.$queryRaw<{ id: number; wp_url: string }[]>`
			SELECT ps.id, ps.wp_url
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${projectServerId}
				AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const projectServer = rows[0];
		if (!projectServer) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}
		return projectServer;
	}

	private async getCredentialOrThrow(credentialId: number, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const rows = await this.prisma.$queryRaw<CredentialRow[]>`
			SELECT
				wc.id,
				wc.project_server_id,
				wc.label,
				wc.username_encrypted,
				wc.password_encrypted,
				wc.status::text AS status,
				wc.notes,
				wc.created_at,
				wc.updated_at
			FROM wp_credentials wc
			JOIN project_servers ps ON ps.id = wc.project_server_id
			JOIN projects p ON p.id = ps.project_id
			WHERE wc.id = ${credentialId}
				AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const credential = rows[0];
		if (!credential) {
			throw new NotFoundException({ detail: 'Credential not found' });
		}
		return credential;
	}

	private toReadModel(row: CredentialRow, username?: string) {
		return {
			id: row.id,
			project_server_id: row.project_server_id,
			label: row.label,
			username: username ?? row.username_encrypted,
			status: row.status,
			notes: row.notes,
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
	}

	async listCredentials(projectServerId: number, ownerId?: number) {
		await this.ensureProjectServer(projectServerId, ownerId);
		const rows = await this.prisma.$queryRaw<CredentialRow[]>`
			SELECT
				id,
				project_server_id,
				label,
				username_encrypted,
				password_encrypted,
				status::text AS status,
				notes,
				created_at,
				updated_at
			FROM wp_credentials
			WHERE project_server_id = ${projectServerId}
			ORDER BY label ASC
		`;
		return rows.map(row => this.toReadModel(row));
	}

	async createCredential(
		projectServerId: number,
		payload: {
			label?: string;
			username: string;
			password: string;
			notes?: string;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		await this.ensureProjectServer(projectServerId, resolvedOwnerId);
		const insertedRows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO wp_credentials (
				project_server_id,
				user_id,
				label,
				username_encrypted,
				username_salt,
				password_encrypted,
				password_salt,
				status,
				notes,
				created_at,
				updated_at
			)
			VALUES (
				${projectServerId},
				${resolvedOwnerId},
				${payload.label ?? 'Admin'},
				${payload.username},
				${'compat-salt'},
				${payload.password},
				${'compat-salt'},
				${'ACTIVE'}::credentialstatus,
				${payload.notes ?? null},
				NOW(),
				NOW()
			)
			RETURNING id
		`;
		const inserted = insertedRows[0];
		if (!inserted) {
			throw new NotFoundException({ detail: 'Failed to create credential' });
		}
		const row = await this.getCredentialOrThrow(inserted.id, resolvedOwnerId);
		return this.toReadModel(row, payload.username);
	}

	async getCredential(
		projectServerId: number,
		credentialId: number,
		ownerId?: number,
	) {
		await this.ensureProjectServer(projectServerId, ownerId);
		const row = await this.getCredentialOrThrow(credentialId, ownerId);
		return this.toReadModel(row, row.username_encrypted);
	}

	async updateCredential(
		projectServerId: number,
		credentialId: number,
		payload: {
			label?: string;
			username?: string;
			password?: string;
			notes?: string;
		},
		ownerId?: number,
	) {
		await this.ensureProjectServer(projectServerId, ownerId);
		await this.getCredentialOrThrow(credentialId, ownerId);
		await this.prisma.$executeRaw`
			UPDATE wp_credentials
			SET
				label = COALESCE(${payload.label ?? null}, label),
				username_encrypted = COALESCE(${payload.username ?? null}, username_encrypted),
				password_encrypted = COALESCE(${payload.password ?? null}, password_encrypted),
				notes = COALESCE(${payload.notes ?? null}, notes),
				updated_at = NOW()
			WHERE id = ${credentialId}
		`;
		const row = await this.getCredentialOrThrow(credentialId, ownerId);
		return this.toReadModel(row, payload.username ?? row.username_encrypted);
	}

	async deleteCredential(
		projectServerId: number,
		credentialId: number,
		ownerId?: number,
	) {
		await this.ensureProjectServer(projectServerId, ownerId);
		await this.getCredentialOrThrow(credentialId, ownerId);
		await this.prisma.$executeRaw`
			DELETE FROM wp_credentials
			WHERE id = ${credentialId}
		`;
	}

	async generateQuickLogin(
		projectServerId: number,
		credentialId: number,
		payload: { method?: string; duration_minutes?: number },
		ownerId?: number,
	) {
		const projectServer = await this.ensureProjectServer(
			projectServerId,
			ownerId,
		);
		const credential = await this.getCredentialOrThrow(credentialId, ownerId);
		const method = payload.method ?? 'auto';
		const duration = payload.duration_minutes ?? 5;
		const expiresAt = new Date(Date.now() + duration * 60 * 1000);
		const wpUrl = projectServer.wp_url.replace(/\/$/, '');
		const username = credential.username_encrypted;
		const password = credential.password_encrypted;

		if (method === 'manual') {
			return {
				method: 'manual',
				login_url: `${wpUrl}/wp-login.php`,
				username,
				password,
				expires_at: null,
				instructions: `Go to ${wpUrl}/wp-login.php and enter the credentials above.`,
			};
		}

		if (method === 'redirect') {
			const token = this.generateToken(16);
			this.quickLoginTokens.set(token, {
				username,
				password,
				wp_url: wpUrl,
				expires_at: expiresAt,
			});
			return {
				method: 'redirect',
				login_url: `/api/v1/credentials/quick-login/${token}`,
				token,
				expires_at: expiresAt,
				instructions:
					'Click the login URL to be automatically redirected to WordPress login.',
			};
		}

		const token = this.generateToken(32);
		this.quickLoginTokens.set(token, {
			username,
			credential_id: credentialId,
			expires_at: expiresAt,
			used: false,
		});

		return {
			method: 'auto',
			login_url: `${wpUrl}/?forge_autologin=${token}`,
			token,
			expires_at: expiresAt,
			instructions:
				'This requires the Forge Auto-Login MU-plugin installed on the target site. Click the URL to be automatically logged in.',
		};
	}

	validateQuickLoginToken(token: string) {
		const tokenData = this.quickLoginTokens.get(token);
		if (!tokenData) {
			throw new NotFoundException({ detail: 'Invalid or expired token' });
		}
		const expiresAt = tokenData.expires_at as Date;
		if (Date.now() > expiresAt.getTime()) {
			this.quickLoginTokens.delete(token);
			throw new NotFoundException({ detail: 'Token has expired' });
		}
		this.quickLoginTokens.delete(token);
		return {
			status: 'valid',
			wp_url: tokenData.wp_url ?? null,
			username: tokenData.username ?? null,
			password: tokenData.password ?? null,
		};
	}

	validateAutologinToken(token: string) {
		const tokenData = this.quickLoginTokens.get(token);
		if (!tokenData) {
			return { valid: false, error: 'Invalid token' };
		}
		const expiresAt = tokenData.expires_at as Date;
		if (Date.now() > expiresAt.getTime()) {
			this.quickLoginTokens.delete(token);
			return { valid: false, error: 'Token expired' };
		}
		if (tokenData.used === true) {
			return { valid: false, error: 'Token already used' };
		}
		this.quickLoginTokens.set(token, { ...tokenData, used: true });
		return { valid: true, username: tokenData.username };
	}
}
