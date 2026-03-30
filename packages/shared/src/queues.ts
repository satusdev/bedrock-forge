// ─── Queue Names ───────────────────────────────────────────────────────────────

export const QUEUES = {
	BACKUPS: 'backups',
	PLUGIN_SCANS: 'plugin-scans',
	SYNC: 'sync',
	MONITORS: 'monitors',
	DOMAINS: 'domains',
	PROJECTS: 'projects',
	NOTIFICATIONS: 'notifications',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// Dead-letter queue names
export const DLQ = {
	BACKUPS: 'backups-dlq',
	PLUGIN_SCANS: 'plugin-scans-dlq',
	SYNC: 'sync-dlq',
	MONITORS: 'monitors-dlq',
	DOMAINS: 'domains-dlq',
	PROJECTS: 'projects-dlq',
	NOTIFICATIONS: 'notifications-dlq',
} as const;

// ─── Job Types ────────────────────────────────────────────────────────────────

export const JOB_TYPES = {
	// Backups
	BACKUP_CREATE: 'backup:create',
	BACKUP_RESTORE: 'backup:restore',
	BACKUP_SCHEDULED: 'backup:scheduled',
	BACKUP_DELETE_FILE: 'backup:delete-file',

	// Plugin scans
	PLUGIN_SCAN_RUN: 'plugin-scan:run',

	// Sync
	SYNC_CLONE: 'sync:clone',
	SYNC_PUSH: 'sync:push',

	// Monitors
	MONITOR_CHECK: 'monitor:check',

	// Domains
	DOMAIN_WHOIS: 'domain:whois',

	// Projects
	PROJECT_CREATE_BEDROCK: 'project:create-bedrock',

	// Notifications
	NOTIFICATION_SEND: 'notification:send',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

// ─── Default Job Options ──────────────────────────────────────────────────────

export const DEFAULT_JOB_OPTIONS = {
	attempts: 3,
	backoff: { type: 'exponential' as const, delay: 1000 },
	removeOnComplete: 1000,
	removeOnFail: 5000,
} as const;

export const BACKUP_JOB_OPTIONS = {
	...DEFAULT_JOB_OPTIONS,
	attempts: 3,
	// 30 min timeout handled in processor
} as const;

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export const WS_EVENTS = {
	JOB_PROGRESS: 'job:progress',
	JOB_COMPLETED: 'job:completed',
	JOB_FAILED: 'job:failed',
	JOB_LOG: 'job:log',
	MONITOR_RESULT: 'monitor:result',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
