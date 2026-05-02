// ─── Security Finding Types ───────────────────────────────────────────────────

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SecurityFindingCategory =
	| 'SSH_CONFIG'
	| 'AUTHORIZED_KEYS'
	| 'FAILED_LOGINS'
	| 'SUCCESSFUL_LOGINS'
	| 'MALWARE'
	| 'OPEN_PORTS'
	| 'WP_CONFIG'
	| 'WP_USERS'
	| 'FILE_PERMISSIONS'
	| 'PHP_CONFIG'
	| 'SUSPICIOUS_FILES'
	| 'OS_UPDATES'
	| 'FIREWALL'
	| 'CRON_JOBS'
	| 'WORLD_WRITABLE'
	| 'SUID_BINARIES'
	| 'HTACCESS'
	| 'VERSION_DISCLOSURE'
	| 'REVERSE_SHELL'
	| 'SECURITY_TOOLS';

export interface SecurityFinding {
	id: string;
	severity: SecuritySeverity;
	category: SecurityFindingCategory;
	title: string;
	description: string;
	remediation?: string;
	resource?: string;
	metadata?: Record<string, unknown>;
}

export type SecurityScanSummary = Record<SecuritySeverity, number>;

// ─── Job Payload Types ────────────────────────────────────────────────────────

export interface SecurityServerScanPayload {
	serverId: number;
	scanTypes: SecurityScanType[];
	jobExecutionId: number;
	scanIds: number[]; // one SecurityScan row per scan_type, pre-created
}

export interface SecurityEnvironmentScanPayload {
	environmentId: number;
	scanTypes: SecurityScanType[];
	jobExecutionId: number;
	scanIds: number[];
}

export type SecurityScanType =
	| 'SSH_AUDIT'
	| 'SERVER_HARDENING'
	| 'MALWARE_SCAN'
	| 'WP_AUDIT'
	| 'PROJECT_MALWARE';

export const SERVER_SCAN_TYPES: SecurityScanType[] = [
	'SSH_AUDIT',
	'SERVER_HARDENING',
	'MALWARE_SCAN',
];

export const ENVIRONMENT_SCAN_TYPES: SecurityScanType[] = [
	'WP_AUDIT',
	'PROJECT_MALWARE',
];
// ─── Schedule Types ──────────────────────────────────────────────────────────

export type SecurityScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface SecurityScanSchedule {
	id: number;
	server_id?: number | null;
	environment_id?: number | null;
	scan_types: SecurityScanType[];
	frequency: SecurityScheduleFrequency;
	hour: number;
	minute: number;
	day_of_week?: number | null;
	day_of_month?: number | null;
	enabled: boolean;
	last_run_at?: string | null;
	notify_enabled: boolean;
	notify_threshold: SecuritySeverity;
	created_at: string;
	updated_at: string;
}

export interface SecurityScheduledScanPayload {
	scheduleId: number;
	serverId?: number;
	environmentId?: number;
	scanTypes: SecurityScanType[];
	notifyEnabled: boolean;
	notifyThreshold: SecuritySeverity;
}
