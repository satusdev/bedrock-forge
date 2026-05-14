import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SecurityRepository } from './security.repository';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import type {
	SecurityScanType,
	SecurityScanSummary,
	SecurityFinding,
} from '@bedrock-forge/shared';
import type { SecuritySeverity } from '@prisma/client';
import type { UpsertSecurityScheduleDto } from './dto/security-schedule.dto';
import type { AckFindingDto, RemoveAckDto } from './dto/ack-finding.dto';
import type { GenerateSecurityReportDto } from './dto/generate-security-report.dto';
import type { UpsertServerAlertSettingDto } from './dto/server-alert-setting.dto';
import type {
	ServerHardeningActionType,
	EnvironmentHardeningActionType,
} from '@bedrock-forge/shared';

const SEVERITY_ORDER: Record<string, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	info: 4,
};

const DEFAULT_SECURITY_ALERT_WATCH_PATHS = [
	'/etc/ssh',
	'/root/.ssh',
	'/home/*/.ssh',
	'/etc/sudoers',
	'/etc/sudoers.d',
	'/etc/crontab',
	'/etc/cron.d',
	'/etc/cron.daily',
	'/etc/cron.hourly',
	'/etc/cron.weekly',
	'/etc/cron.monthly',
	'/root/.bashrc',
	'/root/.profile',
	'/home/*/.bashrc',
	'/home/*/.profile',
	'/var/www/*/wp-config.php',
	'/var/www/*/web/wp-config.php',
	'/var/www/*/web/app/plugins',
	'/var/www/*/web/app/themes',
	'/home/*/public_html/wp-config.php',
	'/home/*/public_html/wp-content/plugins',
	'/home/*/public_html/wp-content/themes',
];

@Injectable()
export class SecurityService {
	private readonly logger = new Logger(SecurityService.name);

	constructor(
		private readonly repo: SecurityRepository,
		@InjectQueue(QUEUES.SECURITY) private readonly securityQueue: Queue,
		@InjectQueue(QUEUES.REPORTS) private readonly reportsQueue: Queue,
	) {}

	// ─── Trigger scans ──────────────────────────────────────────────────────────

	async triggerServerScan(
		serverId: number,
		types: ('SSH_AUDIT' | 'SERVER_HARDENING' | 'MALWARE_SCAN')[],
	) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		// Create a JobExecution row
		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.SECURITY,
			job_type: JOB_TYPES.SECURITY_SERVER_SCAN,
			server_id: BigInt(serverId),
			status: 'queued',
			payload: { serverId, types },
		});

		// Pre-create SecurityScan rows atomically so either all types are created
		// or none are — prevents orphan rows and incomplete scanIds arrays.
		const createdScans = await this.repo.createServerScansTransaction(
			BigInt(serverId),
			execution.id,
			types,
		);
		const scanIds = createdScans.map(s => Number(s.id));

		let bullJob;
		try {
			bullJob = await this.securityQueue.add(
				JOB_TYPES.SECURITY_SERVER_SCAN,
				{
					serverId,
					scanTypes: types,
					jobExecutionId: Number(execution.id),
					scanIds,
				},
				{
					...DEFAULT_JOB_OPTIONS,
					jobId: `security-server-${serverId}-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await Promise.all([
				this.repo.failSecurityScans(createdScans.map(s => s.id)),
				this.repo.updateJobExecution(execution.id, {
					status: 'failed',
					last_error: errMsg,
				}),
			]);
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id), scanIds };
	}

	async triggerEnvironmentScan(
		environmentId: number,
		types: ('WP_AUDIT' | 'PROJECT_MALWARE')[],
	) {
		const env = await this.repo.findEnvironmentById(BigInt(environmentId));
		if (!env)
			throw new NotFoundException(`Environment ${environmentId} not found`);

		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.SECURITY,
			job_type: JOB_TYPES.SECURITY_ENVIRONMENT_SCAN,
			environment_id: BigInt(environmentId),
			server_id: env.server_id,
			status: 'queued',
			payload: { environmentId, types },
		});

		const createdScans = await this.repo.createEnvironmentScansTransaction(
			BigInt(environmentId),
			execution.id,
			types,
		);
		const scanIds = createdScans.map(s => Number(s.id));

		let bullJob;
		try {
			bullJob = await this.securityQueue.add(
				JOB_TYPES.SECURITY_ENVIRONMENT_SCAN,
				{
					environmentId,
					scanTypes: types,
					jobExecutionId: Number(execution.id),
					scanIds,
				},
				{
					...DEFAULT_JOB_OPTIONS,
					jobId: `security-env-${environmentId}-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await Promise.all([
				this.repo.failSecurityScans(createdScans.map(s => s.id)),
				this.repo.updateJobExecution(execution.id, {
					status: 'failed',
					last_error: errMsg,
				}),
			]);
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id), scanIds };
	}

	// ─── Hardening ───────────────────────────────────────────────────────────────

	async applyServerHardening(
		serverId: number,
		actions: ServerHardeningActionType[],
	) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.SECURITY,
			job_type: JOB_TYPES.SECURITY_SERVER_HARDEN,
			server_id: BigInt(serverId),
			status: 'queued',
			payload: { serverId, actions },
		});

		let bullJob;
		try {
			bullJob = await this.securityQueue.add(
				JOB_TYPES.SECURITY_SERVER_HARDEN,
				{ serverId, jobExecutionId: Number(execution.id), actions },
				{
					...DEFAULT_JOB_OPTIONS,
					jobId: `security-harden-server-${serverId}-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(execution.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id) };
	}

	async applyEnvironmentHardening(
		environmentId: number,
		actions: EnvironmentHardeningActionType[],
	) {
		const env = await this.repo.findEnvironmentById(BigInt(environmentId));
		if (!env)
			throw new NotFoundException(`Environment ${environmentId} not found`);

		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.SECURITY,
			job_type: JOB_TYPES.SECURITY_ENVIRONMENT_HARDEN,
			environment_id: BigInt(environmentId),
			server_id: env.server_id,
			status: 'queued',
			payload: { environmentId, actions },
		});

		let bullJob;
		try {
			bullJob = await this.securityQueue.add(
				JOB_TYPES.SECURITY_ENVIRONMENT_HARDEN,
				{ environmentId, jobExecutionId: Number(execution.id), actions },
				{
					...DEFAULT_JOB_OPTIONS,
					jobId: `security-harden-env-${environmentId}-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(execution.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id) };
	}

	// ─── Read ────────────────────────────────────────────────────────────────────

	async getScanById(id: number) {
		const scan = await this.repo.findScanById(BigInt(id));
		if (!scan) throw new NotFoundException(`SecurityScan ${id} not found`);
		return scan;
	}

	async getServerScanHistory(serverId: number, page: number, limit: number) {
		const { data, total } = await this.repo.findServerScanHistory(
			BigInt(serverId),
			page,
			limit,
		);
		return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
	}

	async getEnvironmentScanHistory(
		environmentId: number,
		page: number,
		limit: number,
	) {
		const { data, total } = await this.repo.findEnvironmentScanHistory(
			BigInt(environmentId),
			page,
			limit,
		);
		return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
	}

	async getOverview() {
		const [servers, environments] = await Promise.all([
			this.repo.findAllServersWithLatestScan(),
			this.repo.findAllEnvironmentsWithLatestScan(),
		]);

		let totalCritical = 0;
		let totalHigh = 0;
		let totalMedium = 0;
		let totalLow = 0;

		for (const server of servers) {
			for (const scan of this.dedupeLatestPerType(server.security_scans)) {
				const s = scan.summary as SecurityScanSummary | null;
				if (s) {
					totalCritical += s.critical ?? 0;
					totalHigh += s.high ?? 0;
					totalMedium += s.medium ?? 0;
					totalLow += s.low ?? 0;
				}
			}
		}

		// Build per-server aggregated score — deduplicate to one scan per type
		// so older scans of the same type don't drag down the score or count twice.
		const serverSummaries = servers.map(s => ({
			id: Number(s.id),
			name: s.name,
			ip_address: s.ip_address,
			status: s.status,
			score: this.aggregateScore(this.dedupeLatestPerType(s.security_scans)),
			findings_summary: this.aggregateSummary(
				this.dedupeLatestPerType(s.security_scans),
			),
			last_scanned_at: s.security_scans[0]?.completed_at ?? null,
			scans: s.security_scans.map(sc => ({
				id: Number(sc.id),
				scan_type: sc.scan_type,
				score: sc.score,
				summary: sc.summary,
				completed_at: sc.completed_at,
			})),
		}));

		const environmentSummaries = environments.map(e => ({
			id: Number(e.id),
			type: e.type,
			url: e.url,
			project: e.project,
			server: e.server,
			score: this.aggregateScore(this.dedupeLatestPerType(e.security_scans)),
			findings_summary: this.aggregateSummary(
				this.dedupeLatestPerType(e.security_scans),
			),
			last_scanned_at: e.security_scans[0]?.completed_at ?? null,
		}));

		const scannedServers = serverSummaries.filter(s => s.last_scanned_at !== null);
		const scannedEnvs = environmentSummaries.filter(e => e.last_scanned_at !== null);
		const allScores = [...scannedServers, ...scannedEnvs].map(x => x.score).filter(s => s !== null) as number[];
		const globalScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;

		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const historyScans = await this.repo.findGlobalScanHistory(thirtyDaysAgo);

		const historyMap = new Map<string, { total: number; count: number }>();
		for (const s of historyScans) {
			const date = s.completed_at!.toISOString().split('T')[0];
			const entry = historyMap.get(date) || { total: 0, count: 0 };
			entry.total += s.score!;
			entry.count += 1;
			historyMap.set(date, entry);
		}

		const history = Array.from(historyMap.entries()).map(([date, data]) => ({
			date,
			score: Math.round(data.total / data.count),
		}));

		return {
			servers: serverSummaries,
			environments: environmentSummaries,
			totals: {
				servers_scanned: scannedServers.length,
				environments_scanned: scannedEnvs.length,
				critical: totalCritical,
				high: totalHigh,
				medium: totalMedium,
				low: totalLow,
				global_score: globalScore,
			},
			history,
		};
	}

	async getServersList() {
		const servers = await this.repo.findAllServersWithLatestScan();
		return servers.map(s => ({
			id: Number(s.id),
			name: s.name,
			ip_address: s.ip_address,
			status: s.status,
			score: this.aggregateScore(this.dedupeLatestPerType(s.security_scans)),
			findings_summary: this.aggregateSummary(
				this.dedupeLatestPerType(s.security_scans),
			),
			last_scanned_at: s.security_scans[0]?.completed_at ?? null,
		}));
	}

	async getSecurityLogs(
		filter: { server_id?: number; date_from?: string; date_to?: string },
		page: number,
		limit: number,
	) {
		const { scans, total } = await this.repo.findSecurityLogs(
			{
				server_id: filter.server_id,
				date_from: filter.date_from ? new Date(filter.date_from) : undefined,
				date_to: filter.date_to ? new Date(filter.date_to) : undefined,
			},
			page,
			limit,
		);

		// Flatten auth event findings out of each SSH_AUDIT scan
		const logs: {
			scan_id: number;
			server_id: number | null;
			server_name: string | null;
			server_ip: string | null;
			scanned_at: Date | null;
			category: string;
			severity: string;
			title: string;
			description: string;
			resource: string | null;
			metadata: Record<string, unknown> | null;
		}[] = [];

		for (const scan of scans) {
			const findings = (scan.findings as SecurityFinding[] | null) ?? [];
			const authFindings = findings.filter(f =>
				['FAILED_LOGINS', 'SUCCESSFUL_LOGINS', 'AUTHORIZED_KEYS'].includes(
					f.category,
				),
			);
			for (const f of authFindings) {
				logs.push({
					scan_id: Number(scan.id),
					server_id: scan.server ? Number(scan.server.id) : null,
					server_name: scan.server?.name ?? null,
					server_ip: scan.server?.ip_address ?? null,
					scanned_at: scan.completed_at,
					category: f.category,
					severity: f.severity,
					title: f.title,
					description: f.description,
					resource: f.resource ?? null,
					metadata: (f.metadata as Record<string, unknown>) ?? null,
				});
			}
		}

		return {
			data: logs,
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}

	// ─── Scoring helpers ─────────────────────────────────────────────────────────

	private aggregateScore(
		scans: { score: number | null; summary: unknown }[],
	): number | null {
		if (scans.length === 0) return null;
		const scores = scans
			.map(s => s.score)
			.filter((s): s is number => s !== null);
		if (scores.length === 0) return null;
		return Math.min(...scores); // worst-case score across scan types
	}

	private aggregateSummary(scans: { summary: unknown }[]): SecurityScanSummary {
		const agg: SecurityScanSummary = {
			critical: 0,
			high: 0,
			medium: 0,
			low: 0,
			info: 0,
		};
		for (const scan of scans) {
			const s = scan.summary as SecurityScanSummary | null;
			if (s) {
				agg.critical += s.critical ?? 0;
				agg.high += s.high ?? 0;
				agg.medium += s.medium ?? 0;
				agg.low += s.low ?? 0;
				agg.info += s.info ?? 0;
			}
		}
		return agg;
	}

	/**
	 * Returns only the most recently completed scan per scan_type, eliminating
	 * duplicate scoring from older scans of the same type.
	 */
	private dedupeLatestPerType<
		T extends { scan_type: string; completed_at: Date | null },
	>(scans: T[]): T[] {
		const map = new Map<string, T>();
		for (const s of scans) {
			const existing = map.get(s.scan_type);
			if (
				!existing ||
				(s.completed_at &&
					(!existing.completed_at || s.completed_at > existing.completed_at))
			) {
				map.set(s.scan_type, s);
			}
		}
		return [...map.values()];
	}

	// ─── Schedules ───────────────────────────────────────────────────────────────

	async getServerSchedule(serverId: number) {
		return this.repo.findServerSchedule(BigInt(serverId));
	}

	async upsertServerSchedule(serverId: number, dto: UpsertSecurityScheduleDto) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);
		return this.repo.upsertServerSchedule(BigInt(serverId), {
			scan_types: dto.scan_types,
			frequency: dto.frequency,
			hour: dto.hour,
			minute: dto.minute,
			day_of_week: dto.day_of_week ?? null,
			day_of_month: dto.day_of_month ?? null,
			enabled: dto.enabled ?? true,
			notify_enabled: dto.notify_enabled ?? false,
			notify_threshold: (dto.notify_threshold ??
				'critical') as SecuritySeverity,
		});
	}

	async deleteServerSchedule(serverId: number) {
		return this.repo.deleteServerSchedule(BigInt(serverId));
	}

	async getEnvironmentSchedule(environmentId: number) {
		return this.repo.findEnvironmentSchedule(BigInt(environmentId));
	}

	async upsertEnvironmentSchedule(
		environmentId: number,
		dto: UpsertSecurityScheduleDto,
	) {
		const env = await this.repo.findEnvironmentById(BigInt(environmentId));
		if (!env)
			throw new NotFoundException(`Environment ${environmentId} not found`);
		return this.repo.upsertEnvironmentSchedule(BigInt(environmentId), {
			scan_types: dto.scan_types,
			frequency: dto.frequency,
			hour: dto.hour,
			minute: dto.minute,
			day_of_week: dto.day_of_week ?? null,
			day_of_month: dto.day_of_month ?? null,
			enabled: dto.enabled ?? true,
			notify_enabled: dto.notify_enabled ?? false,
			notify_threshold: (dto.notify_threshold ??
				'critical') as SecuritySeverity,
		});
	}

	async deleteEnvironmentSchedule(environmentId: number) {
		return this.repo.deleteEnvironmentSchedule(BigInt(environmentId));
	}

	// ─── Server Security Alerts ────────────────────────────────────────────────

	async getServerAlertSetting(serverId: number) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		const setting = await this.repo.findServerAlertSetting(BigInt(serverId));
		return (
			setting ?? {
				server_id: BigInt(serverId),
				enabled: false,
				ssh_login_alerts_enabled: true,
				file_change_alerts_enabled: true,
				interval_minutes: 5,
				file_watch_paths: DEFAULT_SECURITY_ALERT_WATCH_PATHS,
				last_checked_at: null,
				last_auth_cursor: null,
				file_snapshot: null,
			}
		);
	}

	async upsertServerAlertSetting(
		serverId: number,
		dto: UpsertServerAlertSettingDto,
	) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		const existing = await this.repo.findServerAlertSetting(BigInt(serverId));
		const current = existing ?? {
			enabled: false,
			ssh_login_alerts_enabled: true,
			file_change_alerts_enabled: true,
			interval_minutes: 5,
			file_watch_paths: DEFAULT_SECURITY_ALERT_WATCH_PATHS,
		};

		return this.repo.upsertServerAlertSetting(BigInt(serverId), {
			enabled: dto.enabled ?? current.enabled,
			ssh_login_alerts_enabled:
				dto.ssh_login_alerts_enabled ?? current.ssh_login_alerts_enabled,
			file_change_alerts_enabled:
				dto.file_change_alerts_enabled ?? current.file_change_alerts_enabled,
			interval_minutes: dto.interval_minutes ?? current.interval_minutes,
			file_watch_paths:
				dto.file_watch_paths && dto.file_watch_paths.length > 0
					? dto.file_watch_paths
					: current.file_watch_paths.length > 0
						? current.file_watch_paths
						: DEFAULT_SECURITY_ALERT_WATCH_PATHS,
		});
	}

	async testServerAlertSetting(serverId: number) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);
		const existing = await this.repo.findServerAlertSetting(BigInt(serverId));
		if (!existing) {
			await this.repo.upsertServerAlertSetting(BigInt(serverId), {
				enabled: false,
				ssh_login_alerts_enabled: true,
				file_change_alerts_enabled: true,
				interval_minutes: 5,
				file_watch_paths: DEFAULT_SECURITY_ALERT_WATCH_PATHS,
			});
		}

		const job = await this.securityQueue.add(
			JOB_TYPES.SECURITY_ALERT_POLL,
			{ serverId, force: true },
			{
				...DEFAULT_JOB_OPTIONS,
				jobId: `security-alert-test-${serverId}-${Date.now()}`,
			},
		);

		return { jobId: String(job.id) };
	}

	// ─── Security settings (IP allowlist via AppSettings) ────────────────────────

	async getSecuritySettings(settingsSvc: {
		get: (key: string) => Promise<{ key: string; value?: string } | null>;
	}) {
		const [allowlist, threshold] = await Promise.all([
			settingsSvc.get('security_ip_allowlist'),
			settingsSvc.get('security_notify_threshold'),
		]);
		return {
			ip_allowlist: allowlist?.value
				? (JSON.parse(allowlist.value) as string[])
				: [],
			notify_threshold: threshold?.value ?? 'critical',
		};
	}

	async setSecuritySettings(
		settingsSvc: {
			set: (key: string, value: string) => Promise<unknown>;
		},
		ip_allowlist: string[],
		notify_threshold: string,
	) {
		await Promise.all([
			settingsSvc.set('security_ip_allowlist', JSON.stringify(ip_allowlist)),
			settingsSvc.set('security_notify_threshold', notify_threshold),
		]);
		return { success: true };
	}

	// ─── Aggregated Findings + Acknowledgements ───────────────────────────────────

	async getAggregatedFindings(
		filters: {
			severity?: string;
			server_id?: number;
			environment_id?: number;
			scan_type?: string;
			acknowledged?: boolean;
		},
		page: number,
		limit: number,
	) {
		const scans = await this.repo.findLatestCompletedScansWithFindings();

		// Flatten all findings into a comparable structure
		type FlatFinding = {
			scan_id: number;
			finding_id: string;
			severity: string;
			category: string;
			title: string;
			description: string;
			remediation: string | undefined;
			resource: string | undefined;
			metadata: Record<string, unknown> | undefined;
			scan_type: string;
			scanned_at: string | null;
			server_id: number | null;
			server_name: string | null;
			server_ip: string | null;
			environment_id: number | null;
			environment_type: string | null;
			project_name: string | null;
			scope_key: string;
		};

		const flat: FlatFinding[] = [];
		for (const scan of scans) {
			const findings = (scan.findings as SecurityFinding[] | null) ?? [];
			const scope_key = scan.server_id
				? `server:${Number(scan.server_id)}`
				: `environment:${Number(scan.environment_id)}`;

			for (const f of findings) {
				flat.push({
					scan_id: Number(scan.id),
					finding_id: f.id,
					severity: f.severity,
					category: f.category,
					title: f.title,
					description: f.description,
					remediation: f.remediation,
					resource: f.resource,
					metadata: f.metadata as Record<string, unknown> | undefined,
					scan_type: scan.scan_type,
					scanned_at: scan.completed_at
						? scan.completed_at.toISOString()
						: null,
					server_id: scan.server_id ? Number(scan.server_id) : null,
					server_name: scan.server_name,
					server_ip: scan.server_ip,
					environment_id: scan.environment_id
						? Number(scan.environment_id)
						: null,
					environment_type: scan.environment_type,
					project_name: scan.project_name,
					scope_key,
				});
			}
		}

		// Load acks for all scope keys present
		const scopeKeys = [...new Set(flat.map(f => f.scope_key))];
		const acksMap = await this.repo.findAcksByScopeKeys(scopeKeys);

		// Attach ack info
		const withAcks = flat.map(f => ({
			...f,
			ack: acksMap.get(`${f.scope_key}::${f.category}::${f.title}`) ?? null,
		}));

		// Apply filters
		let filtered = withAcks;

		if (filters.severity) {
			const sevSet = new Set(filters.severity.split(',').map(s => s.trim()));
			filtered = filtered.filter(f => sevSet.has(f.severity));
		}
		if (filters.server_id !== undefined) {
			filtered = filtered.filter(f => f.server_id === filters.server_id);
		}
		if (filters.environment_id !== undefined) {
			filtered = filtered.filter(
				f => f.environment_id === filters.environment_id,
			);
		}
		if (filters.scan_type) {
			filtered = filtered.filter(f => f.scan_type === filters.scan_type);
		}
		// acknowledged=true  → show ALL findings (acked + unacked together; acked ones show green badge)
		// acknowledged=false or undefined → show only unacked (default to-do view)
		if (filters.acknowledged !== true) {
			filtered = filtered.filter(f => f.ack === null);
		}

		// Sort by severity then recency
		filtered.sort((a, b) => {
			const sev =
				(SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
			if (sev !== 0) return sev;
			const aTime = a.scanned_at ? new Date(a.scanned_at).getTime() : 0;
			const bTime = b.scanned_at ? new Date(b.scanned_at).getTime() : 0;
			return bTime - aTime;
		});

		const total = filtered.length;
		const data = filtered.slice((page - 1) * limit, page * limit);

		return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
	}

	async acknowledgeFinding(userId: number, dto: AckFindingDto) {
		const parts = dto.scope_key.split(':');
		const targetId = BigInt(parts[1]);
		const isServer = parts[0] === 'server';

		await this.repo.upsertAck({
			scope_key: dto.scope_key,
			category: dto.category,
			title: dto.title,
			userId: BigInt(userId),
			serverId: isServer ? targetId : undefined,
			environmentId: isServer ? undefined : targetId,
			note: dto.note ?? null,
		});
	}

	async removeAcknowledgement(dto: RemoveAckDto) {
		await this.repo.deleteAck(dto.scope_key, dto.category, dto.title);
	}

	// ─── Security Reports ────────────────────────────────────────────────────

	async generateSecurityReport(dto: GenerateSecurityReportDto) {
		const execution = await this.repo.createJobExecution({
			queue_name: QUEUES.REPORTS,
			job_type: JOB_TYPES.SECURITY_REPORT_GENERATE,
			status: 'queued',
			payload: {
				serverIds: dto.serverIds ?? null,
				environmentIds: dto.environmentIds ?? null,
				channelIds: dto.channelIds ?? null,
			},
		});

		let bullJob;
		try {
			bullJob = await this.reportsQueue.add(
				JOB_TYPES.SECURITY_REPORT_GENERATE,
				{
					jobExecutionId: Number(execution.id),
					serverIds: dto.serverIds ?? null,
					environmentIds: dto.environmentIds ?? null,
					channelIds: dto.channelIds ?? null,
				},
				{
					...DEFAULT_JOB_OPTIONS,
					attempts: 1,
					jobId: `security-report-${Date.now()}`,
				},
			);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			await this.repo.updateJobExecution(execution.id, {
				status: 'failed',
				last_error: errMsg,
			});
			throw err;
		}

		await this.repo.updateJobExecutionBullId(execution.id, String(bullJob.id));

		return { jobExecutionId: Number(execution.id) };
	}

	async getSecurityReportHistory() {
		const rows = await this.repo.findSecurityReportHistory();
		return rows.map(r => ({ ...r, id: String(r.id) }));
	}
}
