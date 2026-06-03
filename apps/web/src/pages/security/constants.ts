import type { Severity } from './types';

export const SEVERITY_LEVELS: Severity[] = [
	'critical',
	'high',
	'medium',
	'low',
	'info',
];

export const SCAN_TYPE_LABELS: Record<string, string> = {
	SSH_AUDIT: 'SSH Audit',
	SERVER_HARDENING: 'Server Hardening',
	MALWARE_SCAN: 'Malware Scan',
	WP_AUDIT: 'WP Audit',
	PROJECT_MALWARE: 'Project Malware',
	BACKDOOR_SEARCH: 'Backdoor Search',
	PLUGIN_AUDIT: 'Plugin Audit',
};

export const SCAN_TYPE_DESCRIPTIONS: Record<string, string> = {
	SSH_AUDIT: 'Review SSH configuration, auth logs, and brute-force signals.',
	SERVER_HARDENING: 'Check server hardening posture and risky permissions.',
	MALWARE_SCAN: 'Search common server paths for suspicious files.',
	WP_AUDIT: 'Check WordPress users, core, config, and baseline posture.',
	PROJECT_MALWARE: 'Search the WordPress tree for suspicious code patterns.',
	BACKDOOR_SEARCH: 'Look for common PHP backdoor signatures and obfuscation.',
	PLUGIN_AUDIT: 'Review plugin versions and known risky plugin signals.',
};

export const SCAN_FINDINGS_INITIAL_LIMIT = 3;

export const SCAN_TYPES_BY_KIND = {
	server: ['SSH_AUDIT', 'SERVER_HARDENING', 'MALWARE_SCAN'],
	environment: ['WP_AUDIT', 'PROJECT_MALWARE', 'BACKDOOR_SEARCH', 'PLUGIN_AUDIT'],
} as const;

export const SERVER_HARDENING_ACTIONS = [
	{
		id: 'FIX_WORLD_WRITABLE',
		label: 'Fix world-writable files',
		description: 'Remove world-writable permissions from files in /home',
	},
	{
		id: 'DISABLE_X11_FORWARDING',
		label: 'Disable X11 forwarding',
		description: 'Set X11Forwarding no in /etc/ssh/sshd_config',
	},
	{
		id: 'SET_MAX_AUTH_TRIES',
		label: 'Limit SSH auth tries',
		description: 'Set MaxAuthTries 3 in /etc/ssh/sshd_config',
	},
	{
		id: 'FIX_SSH_DIR_PERMS',
		label: 'Fix .ssh directory permissions',
		description: 'Set chmod 700 on /root/.ssh and all /home/*/.ssh',
	},
	{
		id: 'DISABLE_PASSWORD_AUTH',
		label: 'Disable password authentication',
		description: 'Set PasswordAuthentication no — require key-based auth only',
	},
	{
		id: 'INSTALL_FAIL2BAN',
		label: 'Install / start fail2ban',
		description: 'Install fail2ban and enable it to auto-ban brute-force IPs',
	},
	{
		id: 'INSTALL_AUDITD',
		label: 'Install / start auditd',
		description:
			'Install the Linux audit daemon for kernel-level event logging',
	},
	{
		id: 'BLOCK_BRUTE_FORCE_IPS',
		label: 'Block brute-force IPs',
		description: 'Auto-detect IPs with ≥50 failed SSH logins and ufw deny each',
	},
	{
		id: 'DELETE_PHP_UPLOAD_FILES',
		label: 'Delete PHP files in uploads',
		description: 'Remove .php files found inside WordPress uploads directories',
	},
	{
		id: 'CLEAN_HTACCESS_REDIRECTS',
		label: 'Clean suspicious .htaccess redirects',
		description:
			'Remove hardcoded external-domain RewriteRule lines from .htaccess files',
	},
] as const;

export const ENVIRONMENT_HARDENING_ACTIONS = [
	{
		id: 'BLOCK_PHP_UPLOADS',
		label: 'Block PHP in uploads',
		description: 'Deny PHP execution in wp-content/uploads via .htaccess',
	},
	{
		id: 'BLOCK_XMLRPC',
		label: 'Block XML-RPC',
		description: 'Deny access to xmlrpc.php via .htaccess',
	},
	{
		id: 'BLOCK_VERSION_DISCLOSURE',
		label: 'Hide WordPress version',
		description: 'Deny readme.html, license.txt, readme.txt via .htaccess',
	},
	{
		id: 'ADD_SECURITY_HEADERS',
		label: 'Add security headers',
		description: 'Add X-Frame-Options, X-Content-Type-Options, CSP headers',
	},
	{
		id: 'DISABLE_DIRECTORY_LISTING',
		label: 'Disable directory listing',
		description: 'Add Options -Indexes to .htaccess',
	},
	{
		id: 'DELETE_PHP_UPLOAD_FILES',
		label: 'Delete PHP files in uploads',
		description: 'Remove .php files found inside wp-content/uploads',
	},
	{
		id: 'CLEAN_HTACCESS_REDIRECTS',
		label: 'Clean suspicious .htaccess redirects',
		description:
			'Remove hardcoded external-domain RewriteRule lines from .htaccess',
	},
	{
		id: 'BLOCK_DEBUG_LOG',
		label: 'Block debug log access',
		description:
			'Deny HTTP access to .log files (e.g. wp-content/debug.log) via .htaccess',
	},
	{
		id: 'BLOCK_SENSITIVE_FILES',
		label: 'Block sensitive file access',
		description:
			'Deny access to .env, *.bak, *.sql, composer.json/lock, package.json, etc. via .htaccess',
	},
	{
		id: 'DISABLE_FILE_EDITOR',
		label: 'Disable wp-admin file editor',
		description:
			'Add WP_DISALLOW_FILE_EDIT=true to wp-config.php to block the theme/plugin code editor',
	},
	{
		id: 'BLOCK_USER_ENUMERATION',
		label: 'Block user enumeration',
		description:
			'Redirect ?author=N queries via .htaccess to prevent WordPress username disclosure',
	},
	{
		id: 'FORCE_REINSTALL_CORE',
		label: 'Force reinstall WP core',
		description:
			'Overwrites core files with a fresh copy to remove unauthorized changes',
	},
	{
		id: 'UPDATE_ALL_PLUGINS',
		label: 'Update all plugins',
		description:
			'Brings all plugins to the latest version to patch vulnerabilities',
	},
] as const;
