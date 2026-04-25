// ─── Queue Names ───────────────────────────────────────────────────────────────

export const QUEUES = {
	BACKUPS: 'backups',
	PLUGIN_SCANS: 'plugin-scans',
	PLUGIN_UPDATES: 'plugin-updates',
	CUSTOM_PLUGINS: 'custom-plugins',
	SYNC: 'sync',
	MONITORS: 'monitors',
	DOMAINS: 'domains',
	PROJECTS: 'projects',
	NOTIFICATIONS: 'notifications',
	REPORTS: 'reports',
	WP_ACTIONS: 'wp-actions',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// Dead-letter queue names
export const DLQ = {
	BACKUPS: 'backups-dlq',
	PLUGIN_SCANS: 'plugin-scans-dlq',
	PLUGIN_UPDATES: 'plugin-updates-dlq',
	CUSTOM_PLUGINS: 'custom-plugins-dlq',
	SYNC: 'sync-dlq',
	MONITORS: 'monitors-dlq',
	DOMAINS: 'domains-dlq',
	PROJECTS: 'projects-dlq',
	NOTIFICATIONS: 'notifications-dlq',
	REPORTS: 'reports-dlq',
	WP_ACTIONS: 'wp-actions-dlq',
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
	PLUGIN_MANAGE: 'plugin:manage',
	PLUGIN_SCHEDULED_UPDATE: 'plugin:scheduled-update',

	// Custom GitHub plugins
	CUSTOM_PLUGIN_MANAGE: 'custom-plugin:manage',

	// Sync
	SYNC_CLONE: 'sync:clone',
	SYNC_PUSH: 'sync:push',

	// Monitors
	MONITOR_CHECK: 'monitor:check',

	// Domains
	DOMAIN_WHOIS: 'domain:whois',
	DOMAIN_SSL_CHECK: 'domain:ssl-check',

	// Projects
	PROJECT_CREATE_BEDROCK: 'project:create-bedrock',

	// Notifications
	NOTIFICATION_SEND: 'notification:send',

	// Reports
	REPORT_GENERATE: 'report:generate',

	// WP Actions
	WP_FIX_ACTION: 'wp:fix-action',
	WP_DEBUG_TOGGLE: 'wp:debug-toggle',
	WP_DEBUG_REVERT: 'wp:debug-revert',
	WP_LOGS_FETCH: 'wp:logs-fetch',
	WP_CRON_LIST: 'wp:cron-list',
	WP_CLEANUP: 'wp:cleanup',
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
	backoff: { type: 'exponential' as const, delay: 300_000 }, // 5 min initial
	// 30 min timeout handled in processor
} as const;

export const SYNC_JOB_OPTIONS = {
	...DEFAULT_JOB_OPTIONS,
	attempts: 3,
	backoff: { type: 'exponential' as const, delay: 300_000 }, // 5 min initial
} as const;

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export const WS_EVENTS = {
	JOB_PROGRESS: 'job:progress',
	JOB_COMPLETED: 'job:completed',
	JOB_FAILED: 'job:failed',
	JOB_LOG: 'job:log',
	MONITOR_RESULT: 'monitor:result',
	NOTIFICATION_NEW: 'notification:new',
} as const;

export type WsEvent = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
