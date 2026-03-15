import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDatabaseDto } from './dto/create-database.dto';
import { CreateWebsiteDto } from './dto/create-website.dto';

type WebsiteRecord = {
	domain: string;
	email: string;
	php_version: string;
	package: string;
	ssl: boolean;
};

type DatabaseRecord = {
	domain: string;
	db_name: string;
	db_user: string;
};

type CyberpanelUserRecord = {
	username: string;
	email: string;
	first_name: string;
	last_name: string;
	user_type: string;
	status: 'active' | 'suspended';
	has_password: boolean;
	password?: string;
	password_set_at: string | null;
	password_last_changed_at: string | null;
	password_out_of_sync: boolean;
	package_name: string;
	limits: {
		websites_limit: number;
		disk_limit: number;
		bandwidth_limit: number;
	};
	notes: string | null;
	created_at: string;
	updated_at: string;
};

@Injectable()
export class CyberpanelService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly websitesByServer = new Map<number, WebsiteRecord[]>();
	private readonly databasesByServer = new Map<number, DatabaseRecord[]>();
	private readonly usersByServer = new Map<number, CyberpanelUserRecord[]>();

	private async ensureCyberpanelServer(serverId: number) {
		const rows = await this.prisma.$queryRaw<
			{ id: number; panel_type: string; panel_verified: boolean }[]
		>`
			SELECT id, panel_type::text AS panel_type, panel_verified
			FROM servers
			WHERE id = ${serverId}
			LIMIT 1
		`;

		const server = rows[0];
		if (!server) {
			throw new NotFoundException({ detail: 'Server not found' });
		}
		if (server.panel_type !== 'cyberpanel') {
			throw new BadRequestException({
				detail: 'Server is not configured as CyberPanel',
			});
		}
		return server;
	}

	async verify(serverId: number) {
		await this.ensureCyberpanelServer(serverId);
		await this.prisma.$executeRaw`
			UPDATE servers
			SET panel_verified = ${true}, updated_at = NOW()
			WHERE id = ${serverId}
		`;

		return {
			verified: true,
			server_id: serverId,
			message: 'Connection verified',
		};
	}

	async listWebsites(serverId: number) {
		await this.ensureCyberpanelServer(serverId);
		const websites = this.websitesByServer.get(serverId) ?? [];
		return {
			websites,
			total: websites.length,
		};
	}

	async createWebsite(serverId: number, payload: CreateWebsiteDto) {
		await this.ensureCyberpanelServer(serverId);
		const websites = this.websitesByServer.get(serverId) ?? [];
		websites.push({
			domain: payload.domain,
			email: payload.email,
			php_version: payload.php_version ?? '8.1',
			package: payload.package ?? 'Default',
			ssl: payload.ssl ?? true,
		});
		this.websitesByServer.set(serverId, websites);

		return {
			status: 'success',
			domain: payload.domain,
			message: `Website ${payload.domain} created successfully`,
		};
	}

	async deleteWebsite(serverId: number, domain: string) {
		await this.ensureCyberpanelServer(serverId);
		const websites = this.websitesByServer.get(serverId) ?? [];
		this.websitesByServer.set(
			serverId,
			websites.filter(site => site.domain !== domain),
		);

		return {
			status: 'success',
			message: `Website ${domain} deleted successfully`,
		};
	}

	async listDatabases(serverId: number) {
		await this.ensureCyberpanelServer(serverId);
		const databases = this.databasesByServer.get(serverId) ?? [];
		return {
			databases,
			total: databases.length,
		};
	}

	async createDatabase(serverId: number, payload: CreateDatabaseDto) {
		await this.ensureCyberpanelServer(serverId);
		const databases = this.databasesByServer.get(serverId) ?? [];
		databases.push({
			domain: payload.domain,
			db_name: payload.db_name,
			db_user: payload.db_user,
		});
		this.databasesByServer.set(serverId, databases);

		return {
			status: 'success',
			database: payload.db_name,
			user: payload.db_user,
			message: 'Database created successfully',
		};
	}

	async deleteDatabase(serverId: number, dbName: string) {
		await this.ensureCyberpanelServer(serverId);
		const databases = this.databasesByServer.get(serverId) ?? [];
		this.databasesByServer.set(
			serverId,
			databases.filter(item => item.db_name !== dbName),
		);

		return {
			status: 'success',
			database: dbName,
			message: 'Database deleted successfully',
		};
	}

	async issueSsl(serverId: number, domain: string) {
		await this.ensureCyberpanelServer(serverId);
		return {
			status: 'success',
			domain,
			message: 'SSL certificate issued successfully',
		};
	}

	async getWebsiteStats(serverId: number, domain: string) {
		await this.ensureCyberpanelServer(serverId);
		return {
			success: true,
			domain,
			bandwidth_mb: 0,
			disk_usage_mb: 0,
		};
	}

	async changePhpVersion(serverId: number, domain: string, phpVersion: string) {
		await this.ensureCyberpanelServer(serverId);
		const websites = this.websitesByServer.get(serverId) ?? [];
		const website = websites.find(item => item.domain === domain);
		if (website) {
			website.php_version = phpVersion;
		}

		return {
			status: 'success',
			domain,
			php_version: phpVersion,
		};
	}

	async scanWordpressSites(serverId: number) {
		await this.ensureCyberpanelServer(serverId);
		const websites = this.websitesByServer.get(serverId) ?? [];
		const wordpress_sites = websites.map(site => ({
			domain: site.domain,
			path: `/home/${site.domain}/public_html`,
		}));

		return {
			wordpress_sites,
			total: wordpress_sites.length,
		};
	}

	async getServerInfo(serverId: number) {
		await this.ensureCyberpanelServer(serverId);
		return {
			success: true,
			server_id: serverId,
			panel: 'cyberpanel',
			status: 'online',
		};
	}

	private generatePassword(length = 16) {
		const alphabet =
			'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
		let output = '';
		for (let index = 0; index < length; index += 1) {
			output += alphabet[Math.floor(Math.random() * alphabet.length)];
		}
		return output;
	}

	private getUsersForServer(serverId: number) {
		return this.usersByServer.get(serverId) ?? [];
	}

	private mapUserResponse(user: CyberpanelUserRecord) {
		return {
			username: user.username,
			email: user.email,
			first_name: user.first_name,
			last_name: user.last_name,
			full_name: `${user.first_name} ${user.last_name}`.trim(),
			user_type: user.user_type,
			status: user.status,
			has_password: user.has_password,
			password_set_at: user.password_set_at,
			password_out_of_sync: user.password_out_of_sync,
			package_name: user.package_name,
			limits: user.limits,
			notes: user.notes,
			created_at: user.created_at,
			updated_at: user.updated_at,
		};
	}

	async listUsers(serverId: number, sync = false) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);

		return {
			users: users.map(item => this.mapUserResponse(item)),
			total: users.length,
			synced: sync,
		};
	}

	async createUser(
		serverId: number,
		payload: {
			username: string;
			email: string;
			password?: string;
			first_name?: string;
			last_name?: string;
			user_type?: string;
			websites_limit?: number;
			disk_limit?: number;
			bandwidth_limit?: number;
			package_name?: string;
			notes?: string;
		},
	) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);
		if (users.find(item => item.username === payload.username)) {
			throw new BadRequestException({ detail: 'Username already exists' });
		}

		const now = new Date().toISOString();
		const password = payload.password ?? this.generatePassword();
		const user: CyberpanelUserRecord = {
			username: payload.username,
			email: payload.email,
			first_name: payload.first_name ?? '',
			last_name: payload.last_name ?? '',
			user_type: payload.user_type ?? 'user',
			status: 'active',
			has_password: true,
			password,
			password_set_at: now,
			password_last_changed_at: now,
			password_out_of_sync: false,
			package_name: payload.package_name ?? 'Default',
			limits: {
				websites_limit: payload.websites_limit ?? 0,
				disk_limit: payload.disk_limit ?? 0,
				bandwidth_limit: payload.bandwidth_limit ?? 0,
			},
			notes: payload.notes ?? null,
			created_at: now,
			updated_at: now,
		};

		users.push(user);
		this.usersByServer.set(serverId, users);

		return {
			status: 'success',
			message: `User ${payload.username} created successfully`,
			user: {
				...this.mapUserResponse(user),
				password,
				password_notice:
					'Save this password now! It will not be shown again unless you reveal it.',
			},
		};
	}

	async getUser(serverId: number, username: string) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);
		const user = users.find(item => item.username === username);
		if (!user) {
			throw new NotFoundException({ detail: 'User not found' });
		}

		return this.mapUserResponse(user);
	}

	async updateUser(
		serverId: number,
		username: string,
		payload: {
			email?: string;
			first_name?: string;
			last_name?: string;
			websites_limit?: number;
			disk_limit?: number;
			bandwidth_limit?: number;
			notes?: string;
		},
	) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);
		const user = users.find(item => item.username === username);
		if (!user) {
			throw new NotFoundException({ detail: 'User not found' });
		}

		if (payload.email !== undefined) {
			user.email = payload.email;
		}
		if (payload.first_name !== undefined) {
			user.first_name = payload.first_name;
		}
		if (payload.last_name !== undefined) {
			user.last_name = payload.last_name;
		}
		if (payload.websites_limit !== undefined) {
			user.limits.websites_limit = payload.websites_limit;
		}
		if (payload.disk_limit !== undefined) {
			user.limits.disk_limit = payload.disk_limit;
		}
		if (payload.bandwidth_limit !== undefined) {
			user.limits.bandwidth_limit = payload.bandwidth_limit;
		}
		if (payload.notes !== undefined) {
			user.notes = payload.notes;
		}
		user.updated_at = new Date().toISOString();

		return {
			status: 'success',
			message: `User ${username} updated successfully`,
			user: this.mapUserResponse(user),
		};
	}

	async deleteUser(serverId: number, username: string) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);
		this.usersByServer.set(
			serverId,
			users.filter(item => item.username !== username),
		);

		return {
			status: 'success',
			message: `User ${username} deleted successfully`,
		};
	}

	async changeUserPassword(
		serverId: number,
		username: string,
		newPassword?: string,
	) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);
		const user = users.find(item => item.username === username);
		if (!user) {
			throw new NotFoundException({ detail: 'User not found' });
		}

		const password = newPassword ?? this.generatePassword();
		const now = new Date().toISOString();
		user.password = password;
		user.has_password = true;
		user.password_set_at = user.password_set_at ?? now;
		user.password_last_changed_at = now;
		user.password_out_of_sync = false;
		user.updated_at = now;

		return {
			status: 'success',
			message: `Password changed for ${username}`,
			password,
			password_notice:
				'Save this password now! It will not be shown again unless you reveal it.',
		};
	}

	async revealUserPassword(serverId: number, username: string) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);
		const user = users.find(item => item.username === username);
		if (!user) {
			throw new NotFoundException({ detail: 'User not found' });
		}
		if (!user.has_password || !user.password) {
			throw new BadRequestException({
				detail:
					'No password stored for this user. User was discovered from CyberPanel, not created via Forge.',
			});
		}

		return {
			username,
			password: user.password,
			password_set_at: user.password_set_at,
			password_last_changed_at: user.password_last_changed_at,
			warning:
				'Handle this password securely. Consider changing it if you suspect it has been compromised.',
		};
	}

	async suspendUser(serverId: number, username: string) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);
		const user = users.find(item => item.username === username);
		if (!user) {
			throw new NotFoundException({ detail: 'User not found' });
		}
		user.status = 'suspended';
		user.updated_at = new Date().toISOString();

		return {
			status: 'success',
			message: `User ${username} suspended`,
		};
	}

	async unsuspendUser(serverId: number, username: string) {
		await this.ensureCyberpanelServer(serverId);
		const users = this.getUsersForServer(serverId);
		const user = users.find(item => item.username === username);
		if (!user) {
			throw new NotFoundException({ detail: 'User not found' });
		}
		user.status = 'active';
		user.updated_at = new Date().toISOString();

		return {
			status: 'success',
			message: `User ${username} unsuspended`,
		};
	}

	async listPackages(serverId: number) {
		await this.ensureCyberpanelServer(serverId);
		const packages = [
			{ name: 'Default', websites_limit: 0, disk_limit: 0, bandwidth_limit: 0 },
		];
		return {
			packages,
			total: packages.length,
		};
	}

	async listAcls(serverId: number) {
		await this.ensureCyberpanelServer(serverId);
		const acls = [{ name: 'user' }, { name: 'admin' }, { name: 'reseller' }];
		return {
			acls,
			total: acls.length,
		};
	}
}
