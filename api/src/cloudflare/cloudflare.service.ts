import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudflareConnectDto } from './dto/cloudflare.dto';

type SettingRow = {
	value: string | null;
	encrypted_value: string | null;
};

type ZoneRow = {
	id: string;
	name: string;
	status: string;
	name_servers: string | null;
};

type ExpiringDomainRow = {
	id: number;
	name: string;
	expiry_date: Date;
};

type ExpiringSslRow = {
	id: number;
	common_name: string;
	expiry_date: Date;
};

@Injectable()
export class CloudflareService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly tokenKey = 'cloudflare_api_token';
	private readonly lastSyncKey = 'cloudflare_last_sync';
	private readonly zoneCountKey = 'cloudflare_zone_count';

	private parseNameServers(value: string | null): string[] {
		if (!value) {
			return [];
		}

		try {
			const parsed = JSON.parse(value) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(entry): entry is string => typeof entry === 'string',
				);
			}
		} catch {
			return value
				.split(',')
				.map(entry => entry.trim())
				.filter(Boolean);
		}

		return [];
	}

	private daysLeft(expiry: Date): number {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const target = new Date(expiry);
		target.setHours(0, 0, 0, 0);
		const diff = target.getTime() - today.getTime();
		return Math.floor(diff / (1000 * 60 * 60 * 24));
	}

	private async getSetting(key: string) {
		const rows = await this.prisma.$queryRaw<SettingRow[]>`
			SELECT value, encrypted_value
			FROM app_settings
			WHERE key = ${key}
			LIMIT 1
		`;
		return rows[0] ?? null;
	}

	private async upsertSetting(
		key: string,
		payload: {
			value: string | null;
			encryptedValue: string | null;
			isSensitive: boolean;
			description?: string;
		},
	) {
		await this.prisma.$executeRaw`
			INSERT INTO app_settings (
				key,
				value,
				encrypted_value,
				description,
				is_sensitive,
				created_at,
				updated_at
			)
			VALUES (
				${key},
				${payload.value},
				${payload.encryptedValue},
				${payload.description ?? null},
				${payload.isSensitive},
				NOW(),
				NOW()
			)
			ON CONFLICT (key)
			DO UPDATE SET
				value = EXCLUDED.value,
				encrypted_value = EXCLUDED.encrypted_value,
				description = EXCLUDED.description,
				is_sensitive = EXCLUDED.is_sensitive,
				updated_at = NOW()
		`;
	}

	private async deleteSetting(key: string) {
		await this.prisma.$executeRaw`
			DELETE FROM app_settings
			WHERE key = ${key}
		`;
	}

	async connect(payload: CloudflareConnectDto) {
		const token = payload.api_token?.trim() ?? '';
		if (token.length < 10) {
			throw new BadRequestException({ detail: 'Invalid Cloudflare API token' });
		}

		await this.upsertSetting(this.tokenKey, {
			value: null,
			encryptedValue: token,
			isSensitive: true,
			description: 'Cloudflare API Token',
		});

		return { success: true, message: 'Cloudflare connected successfully' };
	}

	async disconnect() {
		await this.deleteSetting(this.tokenKey);
		await this.deleteSetting(this.lastSyncKey);
		await this.deleteSetting(this.zoneCountKey);
		return { success: true, message: 'Cloudflare disconnected' };
	}

	async getStatus() {
		const token = await this.getSetting(this.tokenKey);
		const lastSync = await this.getSetting(this.lastSyncKey);
		const zoneCount = await this.getSetting(this.zoneCountKey);

		return {
			connected: Boolean(token?.encrypted_value ?? token?.value),
			last_sync: lastSync?.value ? new Date(lastSync.value) : null,
			zone_count: Number.parseInt(zoneCount?.value ?? '0', 10) || 0,
		};
	}

	async listZones() {
		const token = await this.getSetting(this.tokenKey);
		if (!token?.encrypted_value && !token?.value) {
			throw new BadRequestException({ detail: 'Cloudflare not connected' });
		}

		const zones = await this.prisma.$queryRaw<ZoneRow[]>`
			SELECT
				COALESCE(NULLIF(d.dns_zone_id, ''), CONCAT('zone-', d.id::text)) AS id,
				d.domain_name AS name,
				CASE WHEN d.status::text = 'active' THEN 'active' ELSE 'inactive' END AS status,
				d.nameservers AS name_servers
			FROM domains d
			WHERE LOWER(COALESCE(d.dns_provider, '')) = 'cloudflare'
			ORDER BY d.id DESC
		`;

		await this.upsertSetting(this.zoneCountKey, {
			value: String(zones.length),
			encryptedValue: null,
			isSensitive: false,
		});

		return zones.map(zone => ({
			id: zone.id,
			name: zone.name,
			status: zone.status,
			name_servers: this.parseNameServers(zone.name_servers),
		}));
	}

	async sync() {
		const token = await this.getSetting(this.tokenKey);
		if (!token?.encrypted_value && !token?.value) {
			throw new BadRequestException({ detail: 'Cloudflare not connected' });
		}

		const domainCountRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
			SELECT COUNT(*)::bigint AS count
			FROM domains
			WHERE LOWER(COALESCE(dns_provider, '')) = 'cloudflare'
		`;
		const sslCountRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
			SELECT COUNT(*)::bigint AS count
			FROM ssl_certificates
			WHERE provider::text = 'cloudflare'
		`;

		const domainsSynced = Number(domainCountRows[0]?.count ?? 0n);
		const sslSynced = Number(sslCountRows[0]?.count ?? 0n);

		await this.upsertSetting(this.lastSyncKey, {
			value: new Date().toISOString(),
			encryptedValue: null,
			isSensitive: false,
		});
		await this.upsertSetting(this.zoneCountKey, {
			value: String(domainsSynced),
			encryptedValue: null,
			isSensitive: false,
		});

		return {
			domains_synced: domainsSynced,
			ssl_synced: sslSynced,
			errors: [] as string[],
		};
	}

	async getExpiring(days = 30) {
		const threshold = new Date();
		threshold.setDate(threshold.getDate() + days);

		const domainRows = await this.prisma.$queryRaw<ExpiringDomainRow[]>`
			SELECT id, domain_name AS name, expiry_date
			FROM domains
			WHERE expiry_date <= ${threshold}
			ORDER BY expiry_date ASC
		`;

		const sslRows = await this.prisma.$queryRaw<ExpiringSslRow[]>`
			SELECT id, common_name, expiry_date
			FROM ssl_certificates
			WHERE expiry_date <= ${threshold}
			ORDER BY expiry_date ASC
		`;

		return {
			domains: domainRows.map(domain => ({
				id: domain.id,
				name: domain.name,
				expiry_date: domain.expiry_date.toISOString().slice(0, 10),
				days_left: this.daysLeft(domain.expiry_date),
			})),
			ssl_certificates: sslRows.map(cert => ({
				id: cert.id,
				common_name: cert.common_name,
				expiry_date: cert.expiry_date.toISOString().slice(0, 10),
				days_left: this.daysLeft(cert.expiry_date),
			})),
		};
	}
}
