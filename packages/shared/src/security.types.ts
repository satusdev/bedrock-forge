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
	| 'PROJECT_MALWARE'
	| 'BACKDOOR_SEARCH'
	| 'PLUGIN_AUDIT';

export const SERVER_SCAN_TYPES: SecurityScanType[] = [
	'SSH_AUDIT',
	'SERVER_HARDENING',
	'MALWARE_SCAN',
];

export const ENVIRONMENT_SCAN_TYPES: SecurityScanType[] = [
	'WP_AUDIT',
	'PROJECT_MALWARE',
	'BACKDOOR_SEARCH',
	'PLUGIN_AUDIT',
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

// ─── Hardening Action Types ───────────────────────────────────────────────────

/**
 * Server-scoped hardening actions.
 * Each action is idempotent — running it twice produces `skipped` on the
 * second run if the fix is already in place.
 */
export type ServerHardeningActionType =
	| 'FIX_WORLD_WRITABLE' // chmod o-w all world-writable files in /home
	| 'DISABLE_X11_FORWARDING' // sshd_config X11Forwarding no + reload
	| 'SET_MAX_AUTH_TRIES' // sshd_config MaxAuthTries 3 + reload
	| 'FIX_SSH_DIR_PERMS' // chmod 700 /root/.ssh + all /home/*/.ssh
	| 'DISABLE_PASSWORD_AUTH' // sshd_config PasswordAuthentication no + reload
	| 'INSTALL_FAIL2BAN' // apt install (if missing) + systemctl enable/start
	| 'INSTALL_AUDITD' // apt install (if missing) + systemctl enable/start
	| 'BLOCK_BRUTE_FORCE_IPS' // detect IPs ≥50 failed logins → ufw deny each
	| 'DELETE_PHP_UPLOAD_FILES' // rm PHP files in /home/*/public_html/*/uploads/
	| 'CLEAN_HTACCESS_REDIRECTS'; // remove hardcoded external-domain RewriteRule lines

/**
 * Environment-scoped (WordPress) hardening actions.
 * Resolves web root automatically for both standard WP and Bedrock layouts.
 */
export type EnvironmentHardeningActionType =
	| 'BLOCK_PHP_UPLOADS' // add deny-php rule to wp-content/uploads/.htaccess
	| 'BLOCK_XMLRPC' // deny xmlrpc.php via .htaccess
	| 'BLOCK_VERSION_DISCLOSURE' // deny readme.html, license.txt, readme.txt
	| 'ADD_SECURITY_HEADERS' // X-Frame-Options, X-Content-Type-Options, XSS
	| 'DISABLE_DIRECTORY_LISTING' // Options -Indexes
	| 'DELETE_PHP_UPLOAD_FILES' // rm PHP files from wp-content/uploads/
	| 'CLEAN_HTACCESS_REDIRECTS' // remove external-domain RewriteRule lines
	| 'BLOCK_DEBUG_LOG' // deny HTTP access to *.log files (debug.log) via .htaccess
	| 'BLOCK_SENSITIVE_FILES' // deny .env, *.bak, *.sql, composer files via .htaccess
	| 'DISABLE_FILE_EDITOR' // add WP_DISALLOW_FILE_EDIT=true to wp-config.php
	| 'BLOCK_USER_ENUMERATION' // redirect ?author=N queries to block username enumeration
	| 'FORCE_REINSTALL_CORE' // wp core download --force
	| 'UPDATE_ALL_PLUGINS'; // wp plugin update --all

export const SERVER_HARDENING_ACTION_TYPES: ServerHardeningActionType[] = [
	'FIX_WORLD_WRITABLE',
	'DISABLE_X11_FORWARDING',
	'SET_MAX_AUTH_TRIES',
	'FIX_SSH_DIR_PERMS',
	'DISABLE_PASSWORD_AUTH',
	'INSTALL_FAIL2BAN',
	'INSTALL_AUDITD',
	'BLOCK_BRUTE_FORCE_IPS',
	'DELETE_PHP_UPLOAD_FILES',
	'CLEAN_HTACCESS_REDIRECTS',
];

export const ENVIRONMENT_HARDENING_ACTION_TYPES: EnvironmentHardeningActionType[] =
	[
		'BLOCK_PHP_UPLOADS',
		'BLOCK_XMLRPC',
		'BLOCK_VERSION_DISCLOSURE',
		'ADD_SECURITY_HEADERS',
		'DISABLE_DIRECTORY_LISTING',
		'DELETE_PHP_UPLOAD_FILES',
		'CLEAN_HTACCESS_REDIRECTS',
		'BLOCK_DEBUG_LOG',
		'BLOCK_SENSITIVE_FILES',
		'DISABLE_FILE_EDITOR',
		'BLOCK_USER_ENUMERATION',
		'FORCE_REINSTALL_CORE',
		'UPDATE_ALL_PLUGINS',
	];

export interface HardeningActionResult {
	action: string;
	/** applied = change made; skipped = already in desired state; failed = error */
	status: 'applied' | 'skipped' | 'failed';
	detail: string;
}

export interface SecurityServerHardeningPayload {
	serverId: number;
	jobExecutionId: number;
	actions: ServerHardeningActionType[];
}

export interface SecurityEnvironmentHardeningPayload {
	environmentId: number;
	jobExecutionId: number;
	actions: EnvironmentHardeningActionType[];
}
