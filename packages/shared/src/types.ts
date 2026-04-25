import { z } from 'zod';

// ─── Job Payload Types ────────────────────────────────────────────────────────
// These schemas describe exactly what is enqueued — workers fetch server/path
// details from Prisma directly, so payloads are minimal (IDs + type only).

export const BackupCreatePayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	type: z.enum(['full', 'db_only', 'files_only']),
	jobExecutionId: z.number().int().positive(),
	backupId: z.number().int().positive(),
});
export type BackupCreatePayload = z.infer<typeof BackupCreatePayloadSchema>;

export const BackupRestorePayloadSchema = z.object({
	backupId: z.number().int().positive(),
	environmentId: z.number().int().positive(),
	jobExecutionId: z.number().int().positive(),
});
export type BackupRestorePayload = z.infer<typeof BackupRestorePayloadSchema>;

export const BackupDeleteFilePayloadSchema = z.object({
	filePath: z.string().min(1),
});
export type BackupDeleteFilePayload = z.infer<
	typeof BackupDeleteFilePayloadSchema
>;

export const BackupScheduledPayloadSchema = z.object({
	scheduleId: z.number().int().positive(),
	environmentId: z.number().int().positive(),
	type: z.enum(['full', 'db_only', 'files_only']),
});
export type BackupScheduledPayload = z.infer<
	typeof BackupScheduledPayloadSchema
>;

// ─── BackupSchedule Domain Types ─────────────────────────────────────────────

export type BackupFrequency = 'daily' | 'weekly' | 'monthly';

export interface BackupSchedule {
	id: number;
	environment_id: number;
	type: 'full' | 'db_only' | 'files_only';
	frequency: BackupFrequency;
	hour: number;
	minute: number;
	day_of_week: number | null;
	day_of_month: number | null;
	enabled: boolean;
	last_run_at: string | null;
	next_run_at: string | null;
	retention_count: number | null;
	retention_days: number | null;
	created_at: string;
	updated_at: string;
}

export const PluginScanRunPayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	jobExecutionId: z.number().int().positive(),
});
export type PluginScanRunPayload = z.infer<typeof PluginScanRunPayloadSchema>;

export const PluginManagePayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	jobExecutionId: z.number().int().positive(),
	action: z.enum([
		'add',
		'remove',
		'update',
		'update-all',
		'change-constraint',
		'read',
	]),
	/** wpackagist-plugin/slug — required for add/remove/update/change-constraint, omit for update-all/read */
	slug: z.string().optional(),
	/** Version constraint e.g. "^1.5" — only relevant for add */
	version: z.string().optional(),
	/** New version constraint — only for change-constraint action */
	constraint: z.string().optional(),
});
export type PluginManagePayload = z.infer<typeof PluginManagePayloadSchema>;

export const SyncClonePayloadSchema = z.object({
	sourceEnvironmentId: z.number().int().positive(),
	targetEnvironmentId: z.number().int().positive(),
	includeDatabase: z.boolean().default(false),
	includeFiles: z.boolean().default(true),
});
export type SyncClonePayload = z.infer<typeof SyncClonePayloadSchema>;

export const SyncPushPayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	serverId: z.number().int().positive(),
	localPath: z.string().min(1),
	remotePath: z.string().min(1),
});
export type SyncPushPayload = z.infer<typeof SyncPushPayloadSchema>;

export const MonitorCheckPayloadSchema = z.object({
	monitorId: z.number().int().positive(),
	environmentId: z.number().int().positive(),
	url: z.string().url(),
});
export type MonitorCheckPayload = z.infer<typeof MonitorCheckPayloadSchema>;

export const DomainWhoisPayloadSchema = z.object({
	domainId: z.number().int().positive(),
	domainName: z.string().min(1),
});
export type DomainWhoisPayload = z.infer<typeof DomainWhoisPayloadSchema>;

// Workers fetch project/server/rootPath from Prisma using the environmentId.
export const CreateBedrockPayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	jobExecutionId: z.number().int().positive(),
	/** Present when CyberPanel provisioning is required */
	cyberpanel: z
		.object({
			domain: z.string(),
			dbName: z.string(),
			dbUser: z.string(),
			dbPassword: z.string(),
			dbHost: z.string().default('localhost'),
			phpVersion: z.string().default('8.3'),
			adminEmail: z.string().optional(),
		})
		.optional(),
	/** If set, clone this environment's DB + files instead of fresh Bedrock install */
	sourceEnvironmentId: z.number().int().positive().optional(),
});
export type CreateBedrockPayload = z.infer<typeof CreateBedrockPayloadSchema>;

// ─── WS Payload Types ─────────────────────────────────────────────────────────

export interface JobProgressEvent {
	jobId: string;
	queueName: string;
	progress: number;
	step?: string;
	environmentId?: number;
}

export interface JobCompletedEvent {
	jobId: string;
	queueName: string;
	result?: unknown;
	environmentId?: number;
}

export interface JobFailedEvent {
	jobId: string;
	queueName: string;
	error: string;
	attempt: number;
	environmentId?: number;
}

export interface MonitorResultEvent {
	monitorId: number;
	environmentId: number;
	statusCode: number;
	responseMs: number;
	isUp: boolean;
	checkedAt: string;
}

export interface JobLogEvent {
	jobExecutionId: number;
	environmentId?: number;
	entry: {
		ts: string;
		step: string;
		level: 'info' | 'warn' | 'error';
		detail?: string;
		command?: string;
		stdout?: string;
		stderr?: string;
		exitCode?: number;
		durationMs?: number;
	};
}

// ─── Custom Plugin Payload Types ─────────────────────────────────────────────

export const CustomPluginManagePayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	jobExecutionId: z.number().int().positive(),
	action: z.enum(['add', 'remove']),
	customPluginId: z.number().int().positive(),
	slug: z.string().regex(/^[a-z0-9_-]+$/),
	repoUrl: z.string().min(1),
	repoPath: z.string().default('.'),
	type: z.enum(['plugin', 'theme']),
});
export type CustomPluginManagePayload = z.infer<
	typeof CustomPluginManagePayloadSchema
>;

// ─── Plugin Scan Types ────────────────────────────────────────────────────────

/**
 * Matches the JSON output of apps/worker/scripts/plugin-scan.php.
 * `active` is intentionally absent — the PHP script cannot determine
 * activation status without WordPress DB access.
 */
export interface PluginInfo {
	slug: string;
	name: string;
	version: string;
	latest_version: string | null;
	update_available: boolean;
	author: string | null;
	plugin_uri: string | null;
	description: string | null;
	/** True when the plugin entry exists in composer.json (Bedrock only) */
	managed_by_composer: boolean;
	/** Composer version constraint from composer.json e.g. "^1.5.0" */
	composer_constraint: string | null;
	/** True for must-use plugins (mu-plugins) — auto-loaded, cannot be managed via composer */
	is_mu_plugin?: boolean;
}

/** Top-level output from plugin-scan.php (new format) */
export interface PluginScanOutput {
	is_bedrock: boolean;
	plugins: PluginInfo[];
}

// ─── WP DB Credentials ───────────────────────────────────────────────────────

export interface WpDbCredentials {
	dbName: string;
	dbUser: string;
	dbPassword: string;
	dbHost: string;
}

// ─── Notification Event Types ─────────────────────────────────────────────────

export const NOTIFICATION_EVENTS = {
	jobs: [
		'backup.completed',
		'backup.failed',
		'plugin-scan.completed',
		'plugin-update.completed',
		'plugin-update.failed',
		'sync.completed',
		'sync.failed',
	],
	monitoring: [
		'monitor.down',
		'monitor.up',
		'monitor.degraded',
		'monitor.ssl_expiry',
		'monitor.dns_failed',
		'monitor.keyword_missing',
	],
	billing: ['invoice.created', 'invoice.overdue'],
	users: ['user.registered', 'user.login'],
	servers: ['server.created', 'server.deleted'],
	reports: ['report.weekly'],
} as const;

export type NotificationEventType =
	| 'backup.completed'
	| 'backup.failed'
	| 'plugin-scan.completed'
	| 'plugin-update.completed'
	| 'plugin-update.failed'
	| 'sync.completed'
	| 'sync.failed'
	| 'monitor.down'
	| 'monitor.up'
	| 'monitor.degraded'
	| 'monitor.ssl_expiry'
	| 'monitor.dns_failed'
	| 'monitor.keyword_missing'
	| 'invoice.created'
	| 'invoice.overdue'
	| 'user.registered'
	| 'user.login'
	| 'server.created'
	| 'server.deleted'
	| 'report.weekly';

export const ALL_NOTIFICATION_EVENTS: NotificationEventType[] = [
	'backup.completed',
	'backup.failed',
	'plugin-scan.completed',
	'plugin-update.completed',
	'plugin-update.failed',
	'sync.completed',
	'sync.failed',
	'monitor.down',
	'monitor.up',
	'monitor.degraded',
	'monitor.ssl_expiry',
	'monitor.dns_failed',
	'monitor.keyword_missing',
	'invoice.created',
	'invoice.overdue',
	'user.registered',
	'user.login',
	'server.created',
	'server.deleted',
	'report.weekly',
];

// ─── Plugin Scheduled Update Payload ─────────────────────────────────────────

export const PluginScheduledUpdatePayloadSchema = z.object({
	scheduleId: z.number().int().positive(),
	environmentId: z.number().int().positive(),
});
export type PluginScheduledUpdatePayload = z.infer<
	typeof PluginScheduledUpdatePayloadSchema
>;

// ─── Notification Send Job Payload ────────────────────────────────────────────

export const NotificationSendPayloadSchema = z.object({
	eventType: z.string().min(1),
	payload: z.record(z.unknown()),
});
export type NotificationSendPayload = z.infer<
	typeof NotificationSendPayloadSchema
>;

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

export const PaginationQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	search: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
