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
	created_at: string;
	updated_at: string;
}

export const PluginScanRunPayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	jobExecutionId: z.number().int().positive(),
});
export type PluginScanRunPayload = z.infer<typeof PluginScanRunPayloadSchema>;

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

// ─── Plugin Scan Types ────────────────────────────────────────────────────────

/**
 * Matches the exact JSON output of apps/worker/scripts/plugin-scan.php.
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
		'sync.completed',
		'sync.failed',
	],
	monitoring: ['monitor.down', 'monitor.up'],
	billing: ['invoice.created', 'invoice.overdue'],
	users: ['user.registered', 'user.login'],
	servers: ['server.created', 'server.deleted'],
} as const;

export type NotificationEventType =
	| 'backup.completed'
	| 'backup.failed'
	| 'plugin-scan.completed'
	| 'sync.completed'
	| 'sync.failed'
	| 'monitor.down'
	| 'monitor.up'
	| 'invoice.created'
	| 'invoice.overdue'
	| 'user.registered'
	| 'user.login'
	| 'server.created'
	| 'server.deleted';

export const ALL_NOTIFICATION_EVENTS: NotificationEventType[] = [
	'backup.completed',
	'backup.failed',
	'plugin-scan.completed',
	'sync.completed',
	'sync.failed',
	'monitor.down',
	'monitor.up',
	'invoice.created',
	'invoice.overdue',
	'user.registered',
	'user.login',
	'server.created',
	'server.deleted',
];

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
