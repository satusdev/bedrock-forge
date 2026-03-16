import { z } from 'zod';

// ─── Job Payload Types ────────────────────────────────────────────────────────

export const BackupCreatePayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	serverId: z.number().int().positive(),
	backupId: z.number().int().positive(),
	type: z.enum(['full', 'db_only', 'files_only']),
	rootPath: z.string().min(1),
});
export type BackupCreatePayload = z.infer<typeof BackupCreatePayloadSchema>;

export const BackupRestorePayloadSchema = z.object({
	backupId: z.number().int().positive(),
	environmentId: z.number().int().positive(),
	serverId: z.number().int().positive(),
});
export type BackupRestorePayload = z.infer<typeof BackupRestorePayloadSchema>;

export const PluginScanRunPayloadSchema = z.object({
	environmentId: z.number().int().positive(),
	serverId: z.number().int().positive(),
	rootPath: z.string().min(1),
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

export const CreateBedrockPayloadSchema = z.object({
	projectId: z.number().int().positive(),
	environmentId: z.number().int().positive(),
	serverId: z.number().int().positive(),
	rootPath: z.string().min(1),
	siteTitle: z.string().min(1),
	adminEmail: z.string().email(),
});
export type CreateBedrockPayload = z.infer<typeof CreateBedrockPayloadSchema>;

// ─── WS Payload Types ─────────────────────────────────────────────────────────

export interface JobProgressEvent {
	jobId: string;
	queueName: string;
	progress: number;
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

// ─── Plugin Scan Types ────────────────────────────────────────────────────────

export interface PluginInfo {
	name: string;
	slug: string;
	version: string;
	active: boolean;
	author: string;
	description: string;
}

// ─── WP DB Credentials ───────────────────────────────────────────────────────

export interface WpDbCredentials {
	dbName: string;
	dbUser: string;
	dbPassword: string;
	dbHost: string;
}

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
