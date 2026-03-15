export type ProjectStatus =
	| 'active'
	| 'inactive'
	| 'maintenance'
	| 'archived'
	| 'error';
export type EnvironmentType = 'local' | 'staging' | 'production';
export type HostingProvider =
	| 'hetzner'
	| 'cyberpanel'
	| 'libyanspider'
	| 'digitalocean'
	| 'vultr'
	| 'aws'
	| 'custom';
export type SSLStatus =
	| 'valid'
	| 'expiring_soon'
	| 'expired'
	| 'not_installed'
	| 'error';

export interface Environment {
	type: EnvironmentType;
	url: string;
	wordpress_version?: string;
	php_version?: string;
	database_host?: string;
	database_name?: string;
	last_updated?: string;
	health_score: number;
}

export interface GitHubIntegration {
	repository_url: string;
	branch: string;
	commit_hash?: string;
	last_sync?: string;
	webhook_id?: string;
	auto_deploy: boolean;
}

export interface GoogleDriveIntegration {
	backup_folder_id?: string;
	backup_folder_url?: string;
	auto_backup: boolean;
	backup_schedule: string;
	last_backup?: string;
	storage_used: number;
}

export interface ServerInfo {
	provider: HostingProvider;
	server_ip: string;
	ssh_user: string;
	ssh_port: number;
	ssh_key_path?: string;
	server_name?: string;
	location?: string;
	specs: Record<string, any>;
	resource_usage: Record<string, number>;
	monthly_cost: number;
	renewal_date?: string;
}

export interface SSLCertificate {
	domain: string;
	status: SSLStatus;
	issuer?: string;
	issued_date?: string;
	expiry_date?: string;
	auto_renewal: boolean;
}

export interface PluginInfo {
	name: string;
	version: string;
	status: string;
	last_updated?: string;
	source: string;
}

export interface ThemeInfo {
	name: string;
	version: string;
	status: string;
	child_theme: boolean;
	customizations: string[];
	last_updated?: string;
}

export type ClientBillingStatus =
	| 'active'
	| 'inactive'
	| 'trial'
	| 'overdue'
	| 'cancelled';

export interface ClientInfo {
	name: string;
	email: string;
	phone?: string | null;
	company?: string | null;
	billing_status?: ClientBillingStatus | null;
	monthly_rate?: number | null;
	contract_start?: string | null;
	contract_end?: string | null;
	notes?: string | null;
	contact_person?: string | null;
}

export interface ClientProjectSummary {
	id: number;
	project_name: string;
	status?: string;
}

export interface ClientInvoiceSummary {
	id: number;
	invoice_number: string;
	status: string;
	total: number;
}

export interface ClientListItem {
	id: number;
	name: string;
	company?: string | null;
	email: string;
	phone?: string | null;
	billing_status?: ClientBillingStatus | null;
	project_count: number;
	invoice_count?: number;
	monthly_retainer?: number | null;
	currency?: string | null;
	projects?: ClientProjectSummary[];
	created_at?: string | null;
}

export interface ClientDetail {
	id: number;
	name: string;
	company?: string | null;
	email: string;
	phone?: string | null;
	billing_email?: string | null;
	address?: string | null;
	website?: string | null;
	notes?: string | null;
	billing_status?: ClientBillingStatus | null;
	payment_terms?: string | null;
	currency?: string | null;
	tax_rate?: number | null;
	auto_billing?: boolean | null;
	contract_start?: string | null;
	contract_end?: string | null;
	contract_terms?: string | null;
	monthly_retainer?: number | null;
	invoice_prefix?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	projects?: ClientProjectSummary[];
	recent_invoices?: ClientInvoiceSummary[];
}

export interface ClientsListResponse {
	clients: ClientListItem[];
	total: number;
	limit: number;
	offset: number;
}

export interface ClientCreateInput {
	name: string;
	email: string;
	company?: string;
	phone?: string;
	billing_email?: string;
	address?: string;
	website?: string;
	notes?: string;
	payment_terms?: number;
	currency?: string;
	tax_rate?: number;
}

export interface ClientUpdateInput {
	name?: string;
	email?: string;
	company?: string;
	phone?: string;
	billing_email?: string;
	address?: string;
	website?: string;
	notes?: string;
	payment_terms?: number;
	currency?: string;
	tax_rate?: number;
	billing_status?: ClientBillingStatus;
	contract_start?: string;
	contract_end?: string;
	monthly_rate?: number;
}

export interface BackupInfo {
	last_backup?: string;
	backup_locations: string[];
	backup_schedule: string;
	retention_days: number;
	total_backups: number;
	backup_size: number;
	google_drive_sync: boolean;
	local_backup_path?: string;
}

export interface AnalyticsInfo {
	monthly_visitors: number;
	page_load_time: number;
	uptime_percentage: number;
	last_uptime_check?: string;
	error_count_24h: number;
	server_response_time: number;
}

export interface DashboardProject {
	project_name: string;
	directory: string;
	status: ProjectStatus;
	created_at: string;
	updated_at: string;
	primary_url: string;
	health_score: number;
	tags: string[];
	notes: string;
	client?: ClientInfo;
	environments: Record<EnvironmentType, Environment>;
	github?: GitHubIntegration;
	google_drive?: GoogleDriveIntegration;
	server?: ServerInfo;
	ssl_certificate?: SSLCertificate;
	plugins: PluginInfo[];
	themes: ThemeInfo[];
	backup: BackupInfo;
	analytics: AnalyticsInfo;
}

export interface DashboardStats {
	total_projects: number;
	active_projects: number;
	total_servers: number;
	healthy_sites: number;
	recent_deployments: number;
	failed_backups: number;
}

export interface TaskStatus {
	status: 'running' | 'completed' | 'failed';
	message: string;
	started_at?: string;
	completed_at?: string;
	error?: string;
	output?: string;
}

export interface GitHubRepository {
	name: string;
	full_name: string;
	description?: string;
	url: string;
	clone_url: string;
	ssh_url: string;
	default_branch: string;
	language?: string;
	stars: number;
	forks: number;
	open_issues: number;
	created_at?: string;
	updated_at?: string;
	pushed_at?: string;
	size: number;
	is_private: boolean;
	owner: {
		login: string;
		name?: string;
		avatar_url: string;
	};
}

export interface GoogleDriveFile {
	id: string;
	name: string;
	size: number;
	mime_type: string;
	created_time: string;
	modified_time: string;
	parents: string[];
	url: string;
}

export interface GoogleDriveStorage {
	limit: number;
	usage: number;
	usage_in_drive: number;
	usage_in_drive_trash: number;
	usage_percent: number;
}

// Backup Schedule Types
export type ScheduleFrequency =
	| 'hourly'
	| 'daily'
	| 'weekly'
	| 'monthly'
	| 'custom';
export type ScheduleStatus = 'active' | 'paused' | 'disabled';
export type BackupType = 'full' | 'database' | 'files';
export type BackupStorageType = 'local' | 'google_drive' | 's3';
export type BackupStatus = 'pending' | 'running' | 'completed' | 'failed';

export type MigrationStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ProjectServerSummary {
	id: number;
	project_id: number;
	server_id: number;
	server_name?: string;
	environment: string;
	wp_path: string;
	wp_url: string;
	gdrive_backups_folder_id?: string;
}

export interface BackupSchedule {
	id: number;
	name: string;
	description?: string;
	project_id: number;
	project_name?: string;
	environment_id?: number;
	environment_name?: string;

	// Schedule timing
	frequency: ScheduleFrequency;
	hour: number;
	minute: number;
	day_of_week?: number;
	day_of_month?: number;
	timezone: string;
	cron_expression?: string;
	cron_display?: string;

	// Backup settings
	backup_type: BackupType;
	storage_type: BackupStorageType;

	// Retention
	retention_count: number;
	retention_days?: number;

	// Status & tracking
	status: ScheduleStatus;
	last_run_at?: string;
	next_run_at?: string;
	last_run_success?: boolean;
	last_run_error?: string;
	run_count: number;
	failure_count: number;

	// Timestamps
	created_at: string;
	updated_at: string;
	config?: Record<string, any>;
}

export interface Backup {
	id: number;
	name: string;
	project_id: number;
	project_name?: string;

	backup_type: BackupType | string;
	storage_type: BackupStorageType | string;
	file_path?: string;
	storage_path?: string; // Alias for file_path
	storage_file_id?: string;
	drive_folder_id?: string;
	gdrive_link?: string;
	size_bytes?: number;

	status: BackupStatus | string;
	error_message?: string;
	notes?: string;

	started_at?: string;
	completed_at?: string;
	created_at: string;
}

export interface ScheduleCreateInput {
	name: string;
	project_id: number;
	environment_id?: number;
	frequency?: ScheduleFrequency;
	hour?: number;
	minute?: number;
	day_of_week?: number;
	day_of_month?: number;
	timezone?: string;
	cron_expression?: string;
	backup_type?: BackupType;
	storage_type?: BackupStorageType;
	retention_count?: number;
	retention_days?: number;
	description?: string;
}

export interface ScheduleUpdateInput {
	name?: string;
	environment_id?: number;
	frequency?: ScheduleFrequency;
	hour?: number;
	minute?: number;
	day_of_week?: number;
	day_of_month?: number;
	timezone?: string;
	cron_expression?: string;
	backup_type?: BackupType;
	storage_type?: BackupStorageType;
	retention_count?: number;
	retention_days?: number;
	status?: ScheduleStatus;
	description?: string;
}
