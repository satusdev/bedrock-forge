import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake/js/Printer.js').default as new (
	fonts: Record<string, Record<string, string>>,
	vfs: unknown,
	urlResolver: { resolve: () => void; resolved: () => Promise<void> },
) => {
	createPdfKitDocument: (
		doc: unknown,
	) => Promise<NodeJS.EventEmitter & { end: () => void }>;
};

const NOOP_RESOLVER = { resolve: () => {}, resolved: () => Promise.resolve() };
const FONTS = {
	Helvetica: {
		normal: 'Helvetica',
		bold: 'Helvetica-Bold',
		italics: 'Helvetica-Oblique',
		bolditalics: 'Helvetica-BoldOblique',
	},
};

const STATUS_ICON: Record<string, string> = {
	completed: 'OK',
	failed: 'FAILED',
	pending: 'Pending',
	running: 'Running',
};

function fmt(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function fmtBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
	return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

type ReportPeriod =
	| 'last_7d'
	| 'last_30d'
	| 'last_90d'
	| 'this_month'
	| 'last_month';

const PERIOD_LABELS: Record<ReportPeriod, string> = {
	last_7d: 'Last 7 days',
	last_30d: 'Last 30 days',
	last_90d: 'Last 90 days',
	this_month: 'This month',
	last_month: 'Last month',
};

function computeDateRange(period: ReportPeriod, now: Date): { startDate: Date; dateRange: string; periodLabel: string } {
	let startDate: Date;
	switch (period) {
		case 'last_30d':
			startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
		case 'last_90d':
			startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
			break;
		case 'this_month': {
			startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
			break;
		}
		case 'last_month': {
			const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
			const m = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
			startDate = new Date(Date.UTC(y, m, 1));
			break;
		}
		default: // last_7d
			startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}
	return {
		startDate,
		dateRange: `${fmt(startDate)} → ${fmt(now)}`,
		periodLabel: PERIOD_LABELS[period] ?? PERIOD_LABELS.last_7d,
	};
}

function th(text: string) {
	return { text, bold: true, fontSize: 8, fillColor: '#f0f0f0' as string };
}

function cell(text: string, color?: string) {
	return { text, fontSize: 8, color: color ?? '#333' };
}

type BackupRow = {
	projectName: string;
	envType: string;
	serverName: string;
	backupType: string;
	status: string;
	completedAt: Date | null;
	sizeBytes: bigint | null;
};

type MonitorRow = {
	projectName: string;
	envUrl: string | null;
	lastStatus: number | null;
	totalChecks: number;
	upChecks: number;
};

function buildDocDef(
	dateRange: string,
	periodLabel: string,
	generatedAt: Date,
	backups: BackupRow[],
	monitors: MonitorRow[],
) {
	const failedBackups = backups.filter(b => b.status === 'failed').length;
	const okBackups = backups.filter(b => b.status === 'completed').length;
	const downMonitors = monitors.filter(
		m => m.lastStatus !== null && (m.lastStatus === 0 || m.lastStatus >= 400),
	).length;

	const summaryCard = (label: string, value: string, color = '#1a1a2e') => ({
		stack: [
			{ text: value, fontSize: 20, bold: true, color },
			{ text: label, fontSize: 7, color: '#666' },
		],
		margin: [4, 4, 4, 4] as [number, number, number, number],
	});

	const backupTableBody: unknown[][] = [
		[
			th('Project / Environment'),
			th('Server'),
			th('Type'),
			th('Status'),
			th('Last Run'),
			th('Size'),
		],
		...backups.map(b => [
			cell(`${b.projectName}\n${b.envType}`),
			cell(b.serverName),
			cell(b.backupType.replace('_', ' ')),
			cell(
				STATUS_ICON[b.status] ?? b.status,
				b.status === 'completed'
					? '#15803d'
					: b.status === 'failed'
						? '#b91c1c'
						: '#555',
			),
			cell(b.completedAt ? fmt(b.completedAt) : '—'),
			cell(b.sizeBytes ? fmtBytes(Number(b.sizeBytes)) : '—'),
		]),
	];

	const monitorTableBody: unknown[][] = [
		[th('Project / URL'), th('Status'), th('Uptime %'), th('Checks (7d)')],
		...monitors.map(m => {
			const isDown =
				m.lastStatus !== null && (m.lastStatus === 0 || m.lastStatus >= 400);
			const uptimePct =
				m.totalChecks > 0
					? ((m.upChecks / m.totalChecks) * 100).toFixed(1) + '%'
					: 'N/A';
			return [
				cell(`${m.projectName}\n${m.envUrl ?? '—'}`),
				cell(isDown ? 'DOWN' : 'UP', isDown ? '#b91c1c' : '#15803d'),
				cell(
					uptimePct,
					m.totalChecks > 0 && parseFloat(uptimePct) < 99
						? '#b91c1c'
						: '#15803d',
				),
				cell(String(m.totalChecks)),
			];
		}),
	];

	return {
		defaultStyle: { font: 'Helvetica', fontSize: 9 },
		pageMargins: [30, 30, 30, 30] as [number, number, number, number],
		content: [
			{
				columns: [
					{ text: 'Bedrock Forge', style: 'title', width: '*' },
					{
						text: `${periodLabel}\n${dateRange}`,
						alignment: 'right',
						fontSize: 9,
						color: '#666',
					},
				],
				margin: [0, 0, 0, 4] as [number, number, number, number],
			},
			{
				canvas: [
					{
						type: 'line',
						x1: 0,
						y1: 0,
						x2: 515,
						y2: 0,
						lineWidth: 1,
						lineColor: '#1a1a2e',
					},
				],
			},
			{ text: '\n' },
			{
				columns: [
					summaryCard('Backups', String(backups.length)),
					summaryCard('Successful', String(okBackups), '#15803d'),
					summaryCard(
						'Failed',
						String(failedBackups),
						failedBackups > 0 ? '#b91c1c' : '#15803d',
					),
					summaryCard(
						'Monitors Down',
						String(downMonitors),
						downMonitors > 0 ? '#b91c1c' : '#15803d',
					),
				],
				margin: [0, 0, 0, 12] as [number, number, number, number],
			},
			{
				text: 'Backup Status',
				style: 'sectionHeader',
				margin: [0, 0, 0, 4] as [number, number, number, number],
			},
			backups.length > 0
				? {
						table: {
							headerRows: 1,
							widths: ['*', 80, 55, 55, 60, 50],
							body: backupTableBody,
						},
						layout: 'lightHorizontalLines' as const,
						margin: [0, 0, 0, 12] as [number, number, number, number],
					}
				: {
						text: 'No backups in the last 7 days.',
						color: '#666',
						margin: [0, 0, 0, 12] as [number, number, number, number],
					},
			{
				text: 'Monitor Status',
				style: 'sectionHeader',
				margin: [0, 0, 0, 4] as [number, number, number, number],
			},
			monitors.length > 0
				? {
						table: {
							headerRows: 1,
							widths: ['*', 60, 60, 70],
							body: monitorTableBody,
						},
						layout: 'lightHorizontalLines' as const,
						margin: [0, 0, 0, 12] as [number, number, number, number],
					}
				: {
						text: 'No monitors configured.',
						color: '#666',
						margin: [0, 0, 0, 12] as [number, number, number, number],
					},
			{
				canvas: [
					{
						type: 'line',
						x1: 0,
						y1: 0,
						x2: 515,
						y2: 0,
						lineWidth: 0.5,
						lineColor: '#ccc',
					},
				],
			},
			{
				text: `Generated ${generatedAt.toUTCString()} by Bedrock Forge`,
				fontSize: 7,
				color: '#999',
				alignment: 'right',
				margin: [0, 4, 0, 0] as [number, number, number, number],
			},
		],
		styles: {
			title: { fontSize: 18, bold: true, color: '#1a1a2e' },
			sectionHeader: { fontSize: 11, bold: true, color: '#1a1a2e' },
		},
	};
}

type PrismaBackup = Awaited<
	ReturnType<PrismaClient['backup']['findMany']>
>[number] & {
	environment: {
		project: { name: string };
		server: { name: string };
		type: string;
	};
};

type PrismaMonitor = Awaited<
	ReturnType<PrismaClient['monitor']['findMany']>
>[number] & {
	environment: { project: { name: string }; url: string | null };
	monitor_results: { is_up: boolean }[];
};

// concurrency=1: PDF generation is CPU-bound — serialised to avoid spikes.
@Processor(QUEUES.REPORTS, { concurrency: 1, lockDuration: 120_000 })
export class ReportProcessor extends WorkerHost {
	private readonly logger = new Logger(ReportProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
	) {
		super();
	}

	async process(job: Job) {
		if (job.name !== JOB_TYPES.REPORT_GENERATE) return;

		const now = new Date();
		const period = (job.data?.period ?? 'last_7d') as ReportPeriod;
		const channelIds = job.data?.channelIds as number[] | null | undefined;
		const { startDate, dateRange, periodLabel } = computeDateRange(period, now);

		this.logger.log(`Generating report [${periodLabel}]: ${dateRange}`);

		// Track execution so this job appears in the dashboard activity feed
		const execution = await this.prisma.jobExecution.create({
			data: {
				queue_name: QUEUES.REPORTS,
				bull_job_id: String(job.id),
				job_type: JOB_TYPES.REPORT_GENERATE,
				status: 'active',
				started_at: now,
				payload: { period, periodLabel, dateRange },
			},
		});

		try {
			// ── 1. Backup data ─────────────────────────────────────────────────────

			const rawBackups = (await this.prisma.backup.findMany({
				where: { created_at: { gte: startDate } },
				include: {
					environment: {
						include: {
							project: { select: { name: true } },
							server: { select: { name: true } },
						},
					},
				},
				orderBy: { created_at: 'desc' },
			})) as PrismaBackup[];

			// Latest backup per environment only
			const seenEnv = new Set<string>();
			const backups: BackupRow[] = [];
			for (const b of rawBackups) {
				const key = String(b.environment_id);
				if (!seenEnv.has(key)) {
					seenEnv.add(key);
					backups.push({
						projectName: b.environment.project.name,
						envType: b.environment.type,
						serverName: b.environment.server.name,
						backupType: b.type,
						status: b.status,
						completedAt: b.completed_at,
						sizeBytes: b.size_bytes,
					});
				}
			}

			// ── 2. Monitor data ────────────────────────────────────────────────────

			const rawMonitors = (await this.prisma.monitor.findMany({
				include: {
					environment: { include: { project: { select: { name: true } } } },
					monitor_results: {
						where: { checked_at: { gte: startDate } },
						select: { is_up: true },
					},
				},
			})) as PrismaMonitor[];

			const monitors: MonitorRow[] = rawMonitors.map(m => ({
				projectName: m.environment.project.name,
				envUrl: m.environment.url,
				lastStatus: m.last_status,
				totalChecks: m.monitor_results.length,
				upChecks: m.monitor_results.filter(r => r.is_up).length,
			}));

			// ── 3. Build PDF ───────────────────────────────────────────────────────

			const pdfBuffer = await this.buildPdf(dateRange, periodLabel, now, backups, monitors);

			// ── 4. Send to Slack ───────────────────────────────────────────────────

			// Honor channelIds filter when provided (manual trigger with specific channels)
			const channelWhere = channelIds?.length
				? { active: true, events: { has: 'report.weekly' }, id: { in: channelIds.map(id => BigInt(id)) } }
				: { active: true, events: { has: 'report.weekly' } };

			const channels = await this.prisma.notificationChannel.findMany({
				where: channelWhere,
			});

			if (channels.length === 0) {
				this.logger.warn(
					'No active Slack channels subscribed to report.weekly',
				);
			} else {
				const { WebClient } = await import('@slack/web-api');
				const filename = `bedrock-forge-report-${period}-${fmt(now)}.pdf`;
				const okBackups = backups.filter(b => b.status === 'completed').length;
				const failedBackups = backups.filter(b => b.status === 'failed').length;
				const downMonitors = monitors.filter(
					m =>
						m.lastStatus !== null &&
						(m.lastStatus === 0 || m.lastStatus >= 400),
				).length;

				const initialComment = [
					`*Bedrock Forge — ${periodLabel}* (${dateRange})`,
					``,
					`• Backups: *${okBackups} successful*, ${failedBackups > 0 ? `*${failedBackups} failed*` : '0 failed'} in period`,
					`• Monitors: ${downMonitors > 0 ? `*${downMonitors} currently down*` : 'all up'} of ${monitors.length} total`,
					``,
					`_(PDF attached)_`,
				].join('\n');

				for (const channel of channels) {
					if (!channel.slack_bot_token_enc || !channel.slack_channel_id)
						continue;
					try {
						const token = this.encryption.decrypt(channel.slack_bot_token_enc);
						const slack = new WebClient(token);
						await slack.filesUploadV2({
							channel_id: channel.slack_channel_id,
							file: pdfBuffer,
							filename,
							title: `${periodLabel} ${fmt(now)}`,
							initial_comment: initialComment,
						});
						this.logger.log(`Report sent to channel "${channel.name}"`);
					} catch (err) {
						this.logger.error(
							`Failed to send to channel "${channel.name}": ${err}`,
						);
					}
				}
			}

			await this.prisma.jobExecution.update({
				where: { id: execution.id },
				data: { status: 'completed', progress: 100, completed_at: new Date() },
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Report generation failed: ${msg}`);
			await this.prisma.jobExecution
				.update({
					where: { id: execution.id },
					data: {
						status: 'failed',
						last_error: msg,
						progress: 0,
						completed_at: new Date(),
					},
				})
				.catch(() => {});
			throw err;
		}
	}

	private async buildPdf(
		dateRange: string,
		periodLabel: string,
		generatedAt: Date,
		backups: BackupRow[],
		monitors: MonitorRow[],
	): Promise<Buffer> {
		const printer = new PdfPrinter(FONTS, undefined, NOOP_RESOLVER);
		const docDef = buildDocDef(dateRange, periodLabel, generatedAt, backups, monitors);
		const doc = await printer.createPdfKitDocument(docDef);

		return new Promise<Buffer>((resolve, reject) => {
			const chunks: Buffer[] = [];
			doc.on('data', (chunk: Buffer) => chunks.push(chunk));
			doc.on('end', () => resolve(Buffer.concat(chunks)));
			doc.on('error', reject);
			doc.end();
		});
	}
}
