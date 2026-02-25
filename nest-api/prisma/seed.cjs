const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = 'postgresql://forge:forge@localhost:5432/forge';
}

const prisma = new PrismaClient();

const DEFAULT_PERMISSIONS = [
	{
		code: 'projects.view',
		name: 'View Projects',
		category: 'projects',
		description: 'View project list and details',
	},
	{
		code: 'projects.create',
		name: 'Create Projects',
		category: 'projects',
		description: 'Create new projects',
	},
	{
		code: 'projects.edit',
		name: 'Edit Projects',
		category: 'projects',
		description: 'Modify project settings',
	},
	{
		code: 'servers.view',
		name: 'View Servers',
		category: 'servers',
		description: 'View server list and details',
	},
	{
		code: 'servers.manage',
		name: 'Manage Servers',
		category: 'servers',
		description: 'Add, edit, and remove servers',
	},
	{
		code: 'clients.view',
		name: 'View Clients',
		category: 'clients',
		description: 'View client list and details',
	},
	{
		code: 'deployments.view',
		name: 'View Deployments',
		category: 'deployments',
		description: 'View deployment history',
	},
	{
		code: 'deployments.execute',
		name: 'Execute Deployments',
		category: 'deployments',
		description: 'Trigger and manage deployments',
	},
	{
		code: 'backups.view',
		name: 'View Backups',
		category: 'backups',
		description: 'View backup list and status',
	},
	{
		code: 'backups.manage',
		name: 'Manage Backups',
		category: 'backups',
		description: 'Create, restore, and delete backups',
	},
	{
		code: 'monitoring.view',
		name: 'View Monitoring',
		category: 'monitoring',
		description: 'View monitoring dashboards',
	},
	{
		code: 'settings.view',
		name: 'View Settings',
		category: 'settings',
		description: 'View system settings',
	},
	{
		code: 'settings.manage',
		name: 'Manage Settings',
		category: 'settings',
		description: 'Modify system settings',
	},
	{
		code: 'users.view',
		name: 'View Users',
		category: 'users',
		description: 'View user list',
	},
	{
		code: 'users.manage',
		name: 'Manage Users',
		category: 'users',
		description: 'Add, edit, and remove users',
	},
	{
		code: 'roles.view',
		name: 'View Roles',
		category: 'users',
		description: 'View role list',
	},
	{
		code: 'roles.manage',
		name: 'Manage Roles',
		category: 'users',
		description: 'Create and edit roles',
	},
];

const DEFAULT_ROLES = [
	{
		name: 'admin',
		display_name: 'Administrator',
		description: 'Full system access',
		color: '#ef4444',
		is_system: true,
		permissions: ['*'],
	},
	{
		name: 'developer',
		display_name: 'Developer',
		description: 'Development and deployment',
		color: '#3b82f6',
		is_system: true,
		permissions: [
			'projects.view',
			'projects.edit',
			'deployments.view',
			'deployments.execute',
			'backups.view',
			'monitoring.view',
		],
	},
	{
		name: 'viewer',
		display_name: 'Viewer',
		description: 'Read-only access',
		color: '#6b7280',
		is_system: true,
		permissions: [
			'projects.view',
			'servers.view',
			'clients.view',
			'deployments.view',
			'backups.view',
			'monitoring.view',
		],
	},
];

const DEMO_SERVERS = [
	{
		name: 'LamaHost Production',
		hostname: '78.46.41.81y',
		ip_address: '78.46.41.81',
		provider: 'hetzner',
		ssh_user: 'root',
		ssh_port: 22,
		ssh_key_path: '~/.ssh/id_rsa',
		panel_type: 'cyberpanel',
		panel_url: 'https://cp.lamahost.ly',
		status: 'online',
		panel_port: 8090,
	},
	{
		name: 'Lamah Production',
		hostname: '46.224.201.233',
		ip_address: '46.224.201.233',
		provider: 'hetzner',
		ssh_user: 'root',
		ssh_port: 22,
		ssh_key_path: '~/.ssh/id_rsa',
		panel_type: 'cyberpanel',
		panel_url: 'https://cp.lamah.ly',
		status: 'online',
		panel_port: 8090,
	},
	{
		name: 'Staging Server',
		hostname: '138.199.151.80',
		ip_address: '138.199.151.80',
		provider: 'hetzner',
		ssh_user: 'root',
		ssh_port: 22,
		ssh_key_path: '~/.ssh/id_rsa',
		panel_type: 'cyberpanel',
		panel_url: 'https://cp.staging.ly',
		status: 'online',
		panel_port: 8090,
	},
];

const DEMO_PROJECTS = [];

const DEMO_MONITORS = [
	{
		name: 'LamaHost Panel',
		url: 'https://cp.lamahost.ly',
		monitor_type: 'uptime',
		interval_seconds: 300,
		timeout_seconds: 30,
	},
	{
		name: 'Lamah Production Panel',
		url: 'https://cp.lamah.ly',
		monitor_type: 'uptime',
		interval_seconds: 300,
		timeout_seconds: 30,
	},
	{
		name: 'Staging Panel',
		url: 'https://cp.staging.ly',
		monitor_type: 'uptime',
		interval_seconds: 300,
		timeout_seconds: 30,
	},
];

const DEMO_CLIENTS = [
	{
		name: 'Demo Client',
		email: 'client@example.local',
		notes: 'Demo client for local development and test workflows.',
		billing_status: 'active',
	},
];

const DEMO_PACKAGES = [
	{
		name: 'Starter Hosting',
		slug: 'starter-hosting',
		description: 'Starter package for brochure and portfolio sites',
		disk_space_gb: 20,
		bandwidth_gb: 250,
		domains_limit: 1,
		databases_limit: 2,
		email_accounts_limit: 10,
		monthly_price: 19,
		quarterly_price: 54,
		yearly_price: 199,
		biennial_price: 379,
		hosting_yearly_price: 199,
		support_monthly_price: 0,
		features: ['1 website', 'Daily backups', 'SSL included'],
		is_featured: false,
	},
	{
		name: 'Business Hosting',
		slug: 'business-hosting',
		description: 'Balanced hosting for growing business workloads',
		disk_space_gb: 50,
		bandwidth_gb: 1000,
		domains_limit: 5,
		databases_limit: 10,
		email_accounts_limit: 50,
		monthly_price: 49,
		quarterly_price: 141,
		yearly_price: 499,
		biennial_price: 949,
		hosting_yearly_price: 499,
		support_monthly_price: 29,
		features: ['Up to 5 websites', 'Priority support', 'Staging included'],
		is_featured: true,
	},
];

const DEMO_SUBSCRIPTIONS = [
	{
		name: 'Demo Business Hosting',
		subscription_type: 'hosting',
		billing_cycle: 'yearly',
		status: 'active',
		client_email: 'client@example.local',
		package_slug: 'business-hosting',
		project_slug: null,
		auto_renew: true,
		currency: 'USD',
		description: 'Seeded hosting subscription for demo billing flows',
	},
	{
		name: 'Demo Support Retainer',
		subscription_type: 'support',
		billing_cycle: 'monthly',
		status: 'active',
		client_email: 'client@example.local',
		package_slug: 'business-hosting',
		project_slug: null,
		auto_renew: true,
		currency: 'USD',
		description: 'Seeded support subscription for demo billing flows',
		amount: 29,
	},
];

const SERVER_PROVIDER_MAP = {
	hetzner: 'hetzner',
	cyberpanel: 'cyberpanel',
	cpanel: 'cpanel',
	digitalocean: 'digitalocean',
	custom: 'custom',
	vultr: 'custom',
	linode: 'custom',
};

const PANEL_TYPE_MAP = {
	cyberpanel: 'cyberpanel',
	cpanel: 'cpanel',
	plesk: 'plesk',
	none: 'none',
	directadmin: 'none',
	webmin: 'none',
};

const SERVER_STATUS_MAP = {
	online: 'online',
	offline: 'offline',
	provisioning: 'provisioning',
	maintenance: 'maintenance',
	unknown: 'offline',
};

const MONITOR_TYPE_MAP = {
	uptime: 'uptime',
	performance: 'performance',
	ssl: 'ssl',
	security: 'security',
	http: 'uptime',
	ping: 'uptime',
	port: 'uptime',
	dns: 'uptime',
	keyword: 'uptime',
	json: 'uptime',
	steam: 'uptime',
	docker: 'uptime',
	game_server: 'uptime',
	grpc: 'uptime',
	mongodb: 'uptime',
	mysql: 'uptime',
	postgres: 'uptime',
	redis: 'uptime',
	radius: 'uptime',
	smtp: 'uptime',
	pop3: 'uptime',
	imap: 'uptime',
	ntp: 'uptime',
	tcp: 'uptime',
	udp: 'uptime',
	websocket: 'uptime',
	whois: 'uptime',
	real_browser: 'uptime',
	push: 'uptime',
	api: 'uptime',
	pagespeed: 'performance',
	playwright: 'performance',
	firebase: 'uptime',
	alert: 'uptime',
};

const BILLING_STATUS_MAP = {
	active: 'active',
	inactive: 'inactive',
	trial: 'trial',
	overdue: 'overdue',
};

const SUBSCRIPTION_TYPE_MAP = {
	hosting: 'hosting',
	domain: 'domain',
	ssl: 'ssl',
	maintenance: 'maintenance',
	support: 'support',
	backup: 'backup',
	cdn: 'cdn',
	email: 'email',
	other: 'other',
};

const BILLING_CYCLE_MAP = {
	monthly: 'monthly',
	quarterly: 'quarterly',
	biannual: 'biannual',
	yearly: 'yearly',
	biennial: 'biennial',
	triennial: 'triennial',
};

const SUBSCRIPTION_STATUS_MAP = {
	active: 'active',
	pending: 'pending',
	cancelled: 'cancelled',
	expired: 'expired',
	suspended: 'suspended',
};

function isProductionEnv() {
	const env = String(process.env.NODE_ENV || process.env.APP_ENV || '').trim();
	return env.toLowerCase() === 'production';
}

function canSeedInProduction() {
	const raw = process.env.SEED_ALLOW_PRODUCTION;
	if (raw == null || raw === '') {
		return false;
	}
	return ['true', '1', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function isDemoMode() {
	const raw = process.env.SEED_DEMO_MODE;
	if (raw == null || raw === '') {
		return false;
	}
	return ['true', '1', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function assertSeedEnvironmentSafe() {
	if (isProductionEnv() && !canSeedInProduction()) {
		throw new Error(
			'Seed blocked in production. Set SEED_ALLOW_PRODUCTION=true to override explicitly.',
		);
	}
}

function getAdminSeed() {
	if (isDemoMode()) {
		const generatedPassword = crypto.randomBytes(12).toString('base64url');
		const password = toStringValue(
			process.env.SEED_ADMIN_PASSWORD,
			generatedPassword,
		);
		if (!process.env.SEED_ADMIN_PASSWORD) {
			console.warn(
				`SEED_ADMIN_PASSWORD was not set. Generated demo admin password: ${password}`,
			);
		}
		return {
			email: toStringValue(process.env.SEED_ADMIN_EMAIL, 'admin@example.local'),
			password,
			fullName: toStringValue(
				process.env.SEED_ADMIN_FULL_NAME,
				'Demo Administrator',
			),
			username: toStringValue(process.env.SEED_ADMIN_USERNAME, 'admin'),
		};
	}

	const email = process.env.SEED_ADMIN_EMAIL;
	const password = process.env.SEED_ADMIN_PASSWORD;
	const fullName = process.env.SEED_ADMIN_FULL_NAME || 'Administrator';
	if (!email || !password) {
		throw new Error(
			'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required when SEED_DEMO_MODE=false',
		);
	}

	const safeName = fullName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '')
		.slice(0, 24);

	return {
		email,
		password,
		fullName,
		username: safeName || 'admin',
	};
}

function getPackageSeedData() {
	if (!isDemoMode()) {
		return [];
	}
	return DEMO_PACKAGES;
}

function getSubscriptionSeedData() {
	if (!isDemoMode()) {
		return [];
	}
	return DEMO_SUBSCRIPTIONS;
}

function toStringValue(value, fallback = '') {
	if (typeof value === 'string') {
		return value.trim();
	}
	if (value == null) {
		return fallback;
	}
	return String(value).trim();
}

function normalizeEnum(value, mapping, fallback) {
	const key = toStringValue(value).toLowerCase();
	if (key && mapping[key]) {
		return mapping[key];
	}
	return fallback;
}

function cycleToDays(cycle) {
	const daysByCycle = {
		monthly: 30,
		quarterly: 90,
		biannual: 180,
		yearly: 365,
		biennial: 730,
		triennial: 1095,
	};
	return daysByCycle[cycle] || 30;
}

function normalizePort(value, fallback = 22) {
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

function normalizeSlug(value, fallback = 'seed-project') {
	const normalized = toStringValue(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '')
		.slice(0, 120);
	return normalized || fallback;
}

function getServerSeedData() {
	if (isDemoMode()) {
		return DEMO_SERVERS;
	}

	const hostname = toStringValue(process.env.SEED_SERVER_HOSTNAME);
	if (!hostname) {
		return [];
	}

	return [
		{
			name:
				toStringValue(process.env.SEED_SERVER_NAME) || toStringValue(hostname),
			hostname,
			provider: 'custom',
			ssh_user:
				toStringValue(process.env.SEED_SERVER_SSH_USER, 'root') || 'root',
			ssh_port: normalizePort(process.env.SEED_SERVER_SSH_PORT, 22),
			ssh_key_path: toStringValue(process.env.SEED_SERVER_SSH_KEY_PATH) || null,
			panel_type: toStringValue(process.env.SEED_CYBERPANEL_USER)
				? 'cyberpanel'
				: 'none',
			status: 'online',
			panel_port: 8090,
			panel_username:
				toStringValue(process.env.SEED_CYBERPANEL_USER) ||
				toStringValue(process.env.SEED_SERVER_PANEL_USERNAME) ||
				null,
			panel_password:
				toStringValue(process.env.SEED_CYBERPANEL_PASSWORD) ||
				toStringValue(process.env.SEED_SERVER_PANEL_PASSWORD) ||
				null,
		},
	];
}

function getProjectSeedData() {
	if (isDemoMode()) {
		return DEMO_PROJECTS;
	}

	const projectName = toStringValue(process.env.SEED_PROJECT_NAME);
	if (!projectName) {
		return [];
	}

	const slug = normalizeSlug(projectName, 'seed-project');

	return [
		{
			name: projectName,
			slug,
			description: toStringValue(process.env.SEED_PROJECT_DESCRIPTION) || null,
			path: toStringValue(process.env.SEED_PROJECT_PATH) || `/var/www/${slug}`,
			status: 'active',
			environment: toStringValue(
				process.env.SEED_PROJECT_ENVIRONMENT,
				'production',
			),
			client_email:
				toStringValue(process.env.SEED_PROJECT_CLIENT_EMAIL) || null,
			server_hostname:
				toStringValue(process.env.SEED_PROJECT_SERVER_HOSTNAME) || null,
		},
	];
}

function getMonitorSeedData() {
	if (isDemoMode()) {
		return DEMO_MONITORS;
	}

	const monitorUrl = toStringValue(process.env.SEED_MONITOR_URL);
	if (!monitorUrl) {
		return [];
	}

	return [
		{
			name: toStringValue(process.env.SEED_MONITOR_NAME) || 'Primary Monitor',
			url: monitorUrl,
			monitor_type: toStringValue(process.env.SEED_MONITOR_TYPE, 'uptime'),
			interval_seconds: normalizePort(
				process.env.SEED_MONITOR_INTERVAL_SECONDS,
				300,
			),
			timeout_seconds: normalizePort(
				process.env.SEED_MONITOR_TIMEOUT_SECONDS,
				30,
			),
			project_slug:
				toStringValue(process.env.SEED_MONITOR_PROJECT_SLUG) || null,
		},
	];
}

function getClientSeedData() {
	if (isDemoMode()) {
		return DEMO_CLIENTS;
	}

	const clientEmail = toStringValue(process.env.SEED_CLIENT_EMAIL);
	if (!clientEmail) {
		return [];
	}

	return [
		{
			name:
				toStringValue(process.env.SEED_CLIENT_NAME) ||
				clientEmail.split('@')[0] ||
				'Client',
			email: clientEmail,
			notes: toStringValue(process.env.SEED_CLIENT_NOTES) || null,
			billing_status: toStringValue(
				process.env.SEED_CLIENT_BILLING_STATUS,
				'active',
			),
		},
	];
}

async function upsertPermissions() {
	for (const permission of DEFAULT_PERMISSIONS) {
		await prisma.permissions.upsert({
			where: { code: permission.code },
			update: {
				name: permission.name,
				description: permission.description,
				category: permission.category,
			},
			create: permission,
		});
	}
}

async function upsertRolesAndLinks() {
	const permissionRows = await prisma.permissions.findMany({
		where: { code: { in: DEFAULT_PERMISSIONS.map(p => p.code) } },
		select: { id: true, code: true },
	});
	const permissionByCode = new Map(permissionRows.map(p => [p.code, p.id]));

	for (const role of DEFAULT_ROLES) {
		const saved = await prisma.roles.upsert({
			where: { name: role.name },
			update: {
				display_name: role.display_name,
				description: role.description,
				color: role.color,
				is_system: role.is_system,
			},
			create: {
				name: role.name,
				display_name: role.display_name,
				description: role.description,
				color: role.color,
				is_system: role.is_system,
			},
			select: { id: true },
		});

		if (role.permissions.includes('*')) {
			for (const permissionId of permissionByCode.values()) {
				await prisma.role_permissions.upsert({
					where: {
						role_id_permission_id: {
							role_id: saved.id,
							permission_id: permissionId,
						},
					},
					update: {},
					create: {
						role_id: saved.id,
						permission_id: permissionId,
					},
				});
			}
			continue;
		}

		for (const code of role.permissions) {
			const permissionId = permissionByCode.get(code);
			if (!permissionId) {
				continue;
			}
			await prisma.role_permissions.upsert({
				where: {
					role_id_permission_id: {
						role_id: saved.id,
						permission_id: permissionId,
					},
				},
				update: {},
				create: {
					role_id: saved.id,
					permission_id: permissionId,
				},
			});
		}
	}
}

async function upsertAdminUser() {
	const adminSeed = getAdminSeed();
	const hashedPassword = await bcrypt.hash(adminSeed.password, 12);

	const admin = await prisma.users.upsert({
		where: { email: adminSeed.email },
		update: {
			username: adminSeed.username,
			full_name: adminSeed.fullName,
			is_active: true,
			is_superuser: true,
			hashed_password: hashedPassword,
		},
		create: {
			email: adminSeed.email,
			username: adminSeed.username,
			full_name: adminSeed.fullName,
			is_active: true,
			is_superuser: true,
			hashed_password: hashedPassword,
		},
		select: { id: true },
	});

	const adminRole = await prisma.roles.findUnique({
		where: { name: 'admin' },
		select: { id: true },
	});

	if (!adminRole) {
		throw new Error('admin role missing after role seed');
	}

	await prisma.user_roles.upsert({
		where: {
			user_id_role_id: {
				user_id: admin.id,
				role_id: adminRole.id,
			},
		},
		update: {},
		create: {
			user_id: admin.id,
			role_id: adminRole.id,
		},
	});

	return admin.id;
}

async function upsertServers(ownerId) {
	const seedServers = getServerSeedData();
	const servers = [];

	for (const seedServer of seedServers) {
		const hostname = toStringValue(seedServer.hostname);
		if (!hostname) {
			continue;
		}

		const data = {
			name: toStringValue(seedServer.name) || hostname,
			hostname,
			provider: normalizeEnum(
				seedServer.provider,
				SERVER_PROVIDER_MAP,
				'custom',
			),
			status: normalizeEnum(seedServer.status, SERVER_STATUS_MAP, 'online'),
			ssh_user: toStringValue(seedServer.ssh_user, 'root') || 'root',
			ssh_port: normalizePort(seedServer.ssh_port, 22),
			ssh_key_path: toStringValue(seedServer.ssh_key_path) || null,
			panel_type: normalizeEnum(seedServer.panel_type, PANEL_TYPE_MAP, 'none'),
			panel_url: toStringValue(seedServer.panel_url) || null,
			owner_id: ownerId,
			panel_port: normalizePort(seedServer.panel_port, 8090),
			panel_verified: Boolean(seedServer.panel_url),
			panel_username: toStringValue(seedServer.panel_username) || null,
			panel_password: toStringValue(seedServer.panel_password) || null,
		};

		const existing = await prisma.servers.findFirst({
			where: {
				hostname,
				owner_id: ownerId,
			},
			select: { id: true },
		});

		if (existing) {
			const updated = await prisma.servers.update({
				where: { id: existing.id },
				data,
				select: { id: true, hostname: true },
			});
			servers.push(updated);
			continue;
		}

		const created = await prisma.servers.create({
			data,
			select: { id: true, hostname: true },
		});
		servers.push(created);
	}

	return servers;
}

async function upsertClients(ownerId) {
	const seedClients = getClientSeedData();
	const clients = [];

	for (const seedClient of seedClients) {
		const email = toStringValue(seedClient.email).toLowerCase();
		if (!email) {
			continue;
		}

		const now = new Date();
		const data = {
			name: toStringValue(seedClient.name) || email,
			email,
			notes: toStringValue(seedClient.notes) || null,
			billing_status: normalizeEnum(
				seedClient.billing_status,
				BILLING_STATUS_MAP,
				'active',
			),
			payment_terms: 'net30',
			currency: 'USD',
			tax_rate: 0,
			auto_billing: false,
			invoice_prefix: 'INV',
			next_invoice_number: 1,
			country: 'Unknown',
			monthly_rate: 0,
			total_revenue: 0,
			outstanding_balance: 0,
			owner_id: ownerId,
			updated_at: now,
		};

		const existing = await prisma.clients.findFirst({
			where: {
				email,
				owner_id: ownerId,
			},
			select: { id: true },
		});

		if (existing) {
			const updated = await prisma.clients.update({
				where: { id: existing.id },
				data,
				select: { id: true, email: true },
			});
			clients.push(updated);
			continue;
		}

		const created = await prisma.clients.create({
			data,
			select: { id: true, email: true },
		});
		clients.push(created);
	}

	return clients;
}

async function upsertProjects(ownerId, serverByHostname, clientByEmail) {
	const seedProjects = getProjectSeedData();
	const projects = [];

	for (const seedProject of seedProjects) {
		const slug = normalizeSlug(seedProject.slug || seedProject.name);
		const serverId = seedProject.server_hostname
			? serverByHostname.get(toStringValue(seedProject.server_hostname))
			: null;
		const clientId = seedProject.client_email
			? clientByEmail.get(toStringValue(seedProject.client_email).toLowerCase())
			: null;

		const data = {
			name: toStringValue(seedProject.name) || slug,
			slug,
			description: toStringValue(seedProject.description) || null,
			path: toStringValue(seedProject.path) || `/var/www/${slug}`,
			status: 'active',
			environment: ['development', 'staging', 'production'].includes(
				toStringValue(seedProject.environment),
			)
				? toStringValue(seedProject.environment)
				: 'production',
			owner_id: ownerId,
			server_id: serverId || null,
			client_id: clientId || null,
			gdrive_connected: false,
		};

		const saved = await prisma.projects.upsert({
			where: { slug },
			update: data,
			create: data,
			select: { id: true, slug: true },
		});

		projects.push(saved);
	}

	return projects;
}

async function upsertMonitors(ownerId, projectBySlug) {
	const seedMonitors = getMonitorSeedData();
	const monitors = [];

	for (const seedMonitor of seedMonitors) {
		const name = toStringValue(seedMonitor.name);
		const url = toStringValue(seedMonitor.url);
		if (!name || !url) {
			continue;
		}

		const projectId = seedMonitor.project_slug
			? projectBySlug.get(normalizeSlug(seedMonitor.project_slug)) || null
			: null;

		const data = {
			name,
			url,
			monitor_type: normalizeEnum(
				seedMonitor.monitor_type,
				MONITOR_TYPE_MAP,
				'uptime',
			),
			interval_seconds: normalizePort(seedMonitor.interval_seconds, 300),
			timeout_seconds: normalizePort(seedMonitor.timeout_seconds, 30),
			is_active: true,
			alert_on_down: true,
			consecutive_failures: 0,
			project_id: projectId,
			created_by_id: ownerId,
		};

		const existing = await prisma.monitors.findFirst({
			where: {
				name,
				url,
				created_by_id: ownerId,
			},
			select: { id: true },
		});

		if (existing) {
			const updated = await prisma.monitors.update({
				where: { id: existing.id },
				data,
				select: { id: true, name: true },
			});
			monitors.push(updated);
			continue;
		}

		const created = await prisma.monitors.create({
			data,
			select: { id: true, name: true },
		});
		monitors.push(created);
	}

	return monitors;
}

async function upsertHostingPackages() {
	const seedPackages = getPackageSeedData();
	const packages = [];

	for (let index = 0; index < seedPackages.length; index += 1) {
		const seedPackage = seedPackages[index];
		const name = toStringValue(seedPackage.name);
		const slug = normalizeSlug(seedPackage.slug || seedPackage.name);
		if (!name || !slug) {
			continue;
		}

		const data = {
			name,
			slug,
			description: toStringValue(seedPackage.description) || null,
			disk_space_gb: Number(seedPackage.disk_space_gb) || 10,
			bandwidth_gb: Number(seedPackage.bandwidth_gb) || 100,
			domains_limit: Number(seedPackage.domains_limit) || 1,
			subdomains_limit: Number(seedPackage.subdomains_limit) || 5,
			databases_limit: Number(seedPackage.databases_limit) || 1,
			email_accounts_limit: Number(seedPackage.email_accounts_limit) || 5,
			ftp_accounts_limit: Number(seedPackage.ftp_accounts_limit) || 5,
			php_workers: Number(seedPackage.php_workers) || 2,
			ram_mb: Number(seedPackage.ram_mb) || 1024,
			cpu_cores: Number(seedPackage.cpu_cores) || 1,
			monthly_price: Number(seedPackage.monthly_price) || 0,
			quarterly_price: Number(seedPackage.quarterly_price) || 0,
			yearly_price: Number(seedPackage.yearly_price) || 0,
			biennial_price: Number(seedPackage.biennial_price) || 0,
			setup_fee: Number(seedPackage.setup_fee) || 0,
			currency: toStringValue(seedPackage.currency, 'USD') || 'USD',
			hosting_yearly_price: Number(seedPackage.hosting_yearly_price) || 0,
			support_monthly_price: Number(seedPackage.support_monthly_price) || 0,
			features: JSON.stringify(
				Array.isArray(seedPackage.features)
					? seedPackage.features.filter(item => typeof item === 'string')
					: [],
			),
			is_active: true,
			is_featured: Boolean(seedPackage.is_featured),
			sort_order: Number(seedPackage.sort_order) || index + 1,
			updated_at: new Date(),
		};

		const saved = await prisma.hosting_packages.upsert({
			where: { slug },
			update: data,
			create: data,
			select: { id: true, slug: true },
		});
		packages.push(saved);
	}

	return packages;
}

async function upsertSubscriptions(
	clientByEmail,
	packageBySlug,
	projectBySlug,
) {
	const seedSubscriptions = getSubscriptionSeedData();
	const subscriptions = [];

	for (const seedSubscription of seedSubscriptions) {
		const clientId = clientByEmail.get(
			toStringValue(seedSubscription.client_email).toLowerCase(),
		);
		if (!clientId) {
			continue;
		}

		const packageId = seedSubscription.package_slug
			? packageBySlug.get(normalizeSlug(seedSubscription.package_slug))
			: null;
		const projectId = seedSubscription.project_slug
			? projectBySlug.get(normalizeSlug(seedSubscription.project_slug)) || null
			: null;

		const cycle = normalizeEnum(
			seedSubscription.billing_cycle,
			BILLING_CYCLE_MAP,
			'monthly',
		);
		const type = normalizeEnum(
			seedSubscription.subscription_type,
			SUBSCRIPTION_TYPE_MAP,
			'other',
		);
		const status = normalizeEnum(
			seedSubscription.status,
			SUBSCRIPTION_STATUS_MAP,
			'active',
		);

		let amount = Number(seedSubscription.amount);
		if (!Number.isFinite(amount) || amount <= 0) {
			if (packageId) {
				const pkg = await prisma.hosting_packages.findUnique({
					where: { id: packageId },
					select: {
						monthly_price: true,
						quarterly_price: true,
						yearly_price: true,
						biennial_price: true,
						support_monthly_price: true,
					},
				});
				if (pkg) {
					if (type === 'support') {
						amount = pkg.support_monthly_price || 0;
					} else {
						amount =
							cycle === 'quarterly'
								? pkg.quarterly_price
								: cycle === 'yearly'
									? pkg.yearly_price
									: cycle === 'biennial'
										? pkg.biennial_price
										: pkg.monthly_price;
					}
				}
			}
		}
		if (!Number.isFinite(amount) || amount < 0) {
			amount = 0;
		}

		const startDate = new Date();
		const nextBillingDate = new Date(startDate);
		nextBillingDate.setDate(nextBillingDate.getDate() + cycleToDays(cycle));

		const data = {
			subscription_type: type,
			name: toStringValue(seedSubscription.name) || `${type} subscription`,
			description: toStringValue(seedSubscription.description) || null,
			provider: toStringValue(seedSubscription.provider) || 'manual',
			external_id: toStringValue(seedSubscription.external_id) || null,
			billing_cycle: cycle,
			amount,
			currency: toStringValue(seedSubscription.currency, 'USD') || 'USD',
			start_date: startDate,
			next_billing_date: nextBillingDate,
			status,
			auto_renew:
				seedSubscription.auto_renew === undefined
					? true
					: Boolean(seedSubscription.auto_renew),
			reminder_days: 7,
			reminder_count: 0,
			total_invoiced: 0,
			total_paid: 0,
			notes: packageId
				? `Seed package: ${toStringValue(seedSubscription.package_slug)}`
				: null,
			client_id: clientId,
			project_id: projectId,
			updated_at: new Date(),
		};

		const existing = await prisma.subscriptions.findFirst({
			where: {
				name: data.name,
				client_id: clientId,
				subscription_type: type,
			},
			select: { id: true },
		});

		if (existing) {
			const updated = await prisma.subscriptions.update({
				where: { id: existing.id },
				data,
				select: { id: true, name: true },
			});
			subscriptions.push(updated);
			continue;
		}

		const created = await prisma.subscriptions.create({
			data,
			select: { id: true, name: true },
		});
		subscriptions.push(created);
	}

	return subscriptions;
}

async function main() {
	assertSeedEnvironmentSafe();

	await upsertPermissions();
	await upsertRolesAndLinks();
	const adminUserId = await upsertAdminUser();
	const servers = await upsertServers(adminUserId);
	const clients = await upsertClients(adminUserId);

	const serverByHostname = new Map(
		servers.map(server => [toStringValue(server.hostname), server.id]),
	);
	const clientByEmail = new Map(
		clients.map(client => [
			toStringValue(client.email).toLowerCase(),
			client.id,
		]),
	);

	const projects = await upsertProjects(
		adminUserId,
		serverByHostname,
		clientByEmail,
	);
	const projectBySlug = new Map(
		projects.map(project => [toStringValue(project.slug), project.id]),
	);
	await upsertMonitors(adminUserId, projectBySlug);

	const packages = await upsertHostingPackages();
	const packageBySlug = new Map(
		packages.map(pkg => [toStringValue(pkg.slug), pkg.id]),
	);
	await upsertSubscriptions(clientByEmail, packageBySlug, projectBySlug);

	const [
		userCount,
		roleCount,
		permissionCount,
		serverCount,
		projectCount,
		monitorCount,
		clientCount,
		packageCount,
		subscriptionCount,
	] = await Promise.all([
		prisma.users.count(),
		prisma.roles.count(),
		prisma.permissions.count(),
		prisma.servers.count(),
		prisma.projects.count(),
		prisma.monitors.count(),
		prisma.clients.count(),
		prisma.hosting_packages.count(),
		prisma.subscriptions.count(),
	]);

	console.log(
		JSON.stringify(
			{
				status: 'ok',
				source: 'prisma',
				users: userCount,
				roles: roleCount,
				permissions: permissionCount,
				servers: serverCount,
				projects: projectCount,
				monitors: monitorCount,
				clients: clientCount,
				hostingPackages: packageCount,
				subscriptions: subscriptionCount,
				demoMode: isDemoMode(),
			},
			null,
			2,
		),
	);
}

if (require.main === module) {
	main()
		.catch(error => {
			console.error('Prisma seed failed:', error);
			process.exit(1);
		})
		.finally(async () => {
			await prisma.$disconnect();
		});
}

module.exports = { main };
