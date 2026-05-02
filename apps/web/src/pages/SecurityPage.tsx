import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ShieldAlert,
	ShieldCheck,
	ShieldX,
	Shield,
	RefreshCw,
	ServerIcon,
	FolderKanban,
	ChevronDown,
	ChevronRight,
	AlertTriangle,
	Info,
	Plus,
	Trash2,
	Clock,
	Settings2,
	Lock,
	Monitor,
	ListFilter,
	CheckCircle2,
	X,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/crud';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface SecurityFinding {
	id: string;
	severity: Severity;
	category: string;
	title: string;
	description: string;
	remediation?: string;
	resource?: string;
	metadata?: Record<string, unknown>;
}

interface ScanSummary {
	critical: number;
	high: number;
	medium: number;
	low: number;
	info: number;
}

interface ServerSummary {
	id: number;
	name: string;
	ip_address: string;
	status: string;
	score: number | null;
	findings_summary: ScanSummary;
	last_scanned_at: string | null;
}

interface EnvironmentSummary {
	id: number;
	type: string;
	url: string;
	project: { id: number; name: string };
	server: { id: number; name: string };
	score: number | null;
	findings_summary: ScanSummary;
	last_scanned_at: string | null;
}

interface OverviewData {
	servers: (ServerSummary & {
		scans: {
			id: number;
			scan_type: string;
			score: number | null;
			summary: ScanSummary | null;
			completed_at: string | null;
		}[];
	})[];
	environments: EnvironmentSummary[];
	totals: {
		servers_scanned: number;
		environments_scanned: number;
		critical: number;
		high: number;
		medium: number;
		low: number;
	};
}

interface ScanRecord {
	id: number;
	scan_type: string;
	status: string;
	score: number | null;
	summary: ScanSummary | null;
	findings: SecurityFinding[] | null;
	error: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
}

interface ScanHistory {
	data: ScanRecord[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

interface LogEntry {
	scan_id: number;
	server_id: number | null;
	server_name: string | null;
	server_ip: string | null;
	scanned_at: string | null;
	category: string;
	severity: Severity;
	title: string;
	description: string;
	resource: string | null;
	metadata: Record<string, unknown> | null;
}

interface LogsResponse {
	data: LogEntry[];
	total: number;
	page: number;
	totalPages: number;
}

interface SecuritySchedule {
	id?: number;
	scan_types: string[];
	frequency: 'daily' | 'weekly' | 'monthly';
	hour: number;
	minute: number;
	day_of_week?: number | null;
	day_of_month?: number | null;
	enabled: boolean;
	last_run_at?: string | null;
	notify_enabled: boolean;
	notify_threshold: string;
}

interface SecuritySettings {
	ip_allowlist: string[];
	notify_threshold: string;
}

interface FindingAck {
	note: string | null;
	acknowledged_by_name: string;
	created_at: string;
}

interface FindingRow {
	scan_id: number;
	finding_id: string;
	severity: Severity;
	category: string;
	title: string;
	description: string;
	remediation?: string;
	resource?: string;
	metadata?: Record<string, unknown>;
	scan_type: string;
	scanned_at: string | null;
	server_id: number | null;
	server_name: string | null;
	server_ip: string | null;
	environment_id: number | null;
	environment_type: string | null;
	project_name: string | null;
	scope_key: string;
	ack: FindingAck | null;
}

interface FindingsResponse {
	data: FindingRow[];
	total: number;
	page: number;
	totalPages: number;
}

interface SessionItem {
	id: number;
	created_at: string;
	expires_at: string;
	user_agent: string | null;
	ip_address: string | null;
}

// ─── Helper Components ────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Severity }) {
	const variants: Record<Severity, string> = {
		critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
		high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
		medium:
			'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
		low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
		info: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
	};
	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${variants[severity]}`}
		>
			{severity.toUpperCase()}
		</span>
	);
}

function ScoreRing({ score }: { score: number | null }) {
	if (score === null) {
		return (
			<div className='w-14 h-14 rounded-full border-4 border-muted flex items-center justify-center text-xs text-muted-foreground font-semibold'>
				N/A
			</div>
		);
	}
	const color =
		score >= 80
			? '#22c55e'
			: score >= 60
				? '#eab308'
				: score >= 40
					? '#f97316'
					: '#ef4444';
	const r = 22;
	const circ = 2 * Math.PI * r;
	const dash = (score / 100) * circ;
	return (
		<div className='relative w-14 h-14'>
			<svg
				viewBox='0 0 56 56'
				className='absolute inset-0 -rotate-90'
				width='56'
				height='56'
			>
				<circle
					cx='28'
					cy='28'
					r={r}
					fill='none'
					strokeWidth='6'
					className='stroke-muted'
				/>
				<circle
					cx='28'
					cy='28'
					r={r}
					fill='none'
					strokeWidth='6'
					stroke={color}
					strokeDasharray={`${dash} ${circ - dash}`}
					strokeLinecap='round'
				/>
			</svg>
			<div
				className='absolute inset-0 flex items-center justify-center text-sm font-bold'
				style={{ color }}
			>
				{score}
			</div>
		</div>
	);
}

function SummaryBadges({ summary }: { summary: ScanSummary }) {
	if (!summary) return null;
	return (
		<div className='flex gap-1 flex-wrap'>
			{summary.critical > 0 && (
				<span className='text-xs bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-1.5 py-0.5 rounded font-semibold'>
					{summary.critical} critical
				</span>
			)}
			{summary.high > 0 && (
				<span className='text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 px-1.5 py-0.5 rounded font-semibold'>
					{summary.high} high
				</span>
			)}
			{summary.medium > 0 && (
				<span className='text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 px-1.5 py-0.5 rounded'>
					{summary.medium} med
				</span>
			)}
			{summary.low > 0 && (
				<span className='text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded'>
					{summary.low} low
				</span>
			)}
			{summary.info > 0 && (
				<span className='text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 px-1.5 py-0.5 rounded'>
					{summary.info} info
				</span>
			)}
		</div>
	);
}

function FindingItem({
	finding,
	row,
	onAck,
	onUnAck,
}: {
	finding: SecurityFinding;
	row?: FindingRow;
	onAck?: (row: FindingRow) => void;
	onUnAck?: (row: FindingRow) => void;
}) {
	const [open, setOpen] = useState(false);
	const icons: Record<Severity, React.ReactNode> = {
		critical: <ShieldX className='h-4 w-4 text-red-500 shrink-0' />,
		high: <AlertTriangle className='h-4 w-4 text-orange-500 shrink-0' />,
		medium: <AlertTriangle className='h-4 w-4 text-yellow-500 shrink-0' />,
		low: <Info className='h-4 w-4 text-blue-500 shrink-0' />,
		info: <Info className='h-4 w-4 text-gray-400 shrink-0' />,
	};
	const hasMetadata =
		finding.metadata && Object.keys(finding.metadata).length > 0;

	return (
		<div className='border rounded-md overflow-hidden bg-card'>
			<button
				className='w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors'
				onClick={() => setOpen(v => !v)}
			>
				{icons[finding.severity]}
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2 flex-wrap'>
						<SeverityBadge severity={finding.severity} />
						<span className='text-xs text-muted-foreground'>
							{finding.category.replace(/_/g, ' ')}
						</span>
						{/* Source pill — which server/environment + scan type */}
						{row && (
							<span className='text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono'>
								{row.server_name
									? `${row.server_name} · ${row.scan_type.replace(/_/g, ' ')}`
									: row.project_name
										? `${row.project_name} / ${row.environment_type} · ${row.scan_type.replace(/_/g, ' ')}`
										: row.scan_type.replace(/_/g, ' ')}
							</span>
						)}
						{row?.ack && (
							<span className='inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium'>
								<CheckCircle2 className='h-3 w-3' />
								Reviewed
							</span>
						)}
					</div>
					<p className='text-sm font-medium mt-0.5'>{finding.title}</p>
					{row?.ack?.note && (
						<p className='text-xs text-muted-foreground italic mt-0.5'>
							{row.ack.note}
						</p>
					)}
				</div>
				{open ? (
					<ChevronDown className='h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground' />
				) : (
					<ChevronRight className='h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground' />
				)}
			</button>
			{open && (
				<div className='px-3 pb-3 border-t bg-muted/20 space-y-2 pt-2 text-sm'>
					<p className='text-muted-foreground'>{finding.description}</p>
					{finding.resource && (
						<p className='font-mono text-xs bg-muted px-2 py-1 rounded'>
							{finding.resource}
						</p>
					)}
					{finding.remediation && (
						<div className='border-l-2 border-green-400 pl-2'>
							<p className='text-xs text-muted-foreground font-medium mb-0.5'>
								Remediation
							</p>
							<p className='text-xs'>{finding.remediation}</p>
						</div>
					)}
					{hasMetadata && (
						<div className='border-l-2 border-blue-300 pl-2'>
							<p className='text-xs text-muted-foreground font-medium mb-1'>
								Details
							</p>
							<dl className='space-y-0.5'>
								{Object.entries(finding.metadata!).map(([k, v]) => (
									<div key={k} className='flex gap-2 text-xs'>
										<dt className='text-muted-foreground font-medium shrink-0 min-w-[100px]'>
											{k.replace(/_/g, ' ')}
										</dt>
										<dd className='font-mono text-foreground break-all'>
											{Array.isArray(v)
												? v.join(', ')
												: typeof v === 'object' && v !== null
													? JSON.stringify(v)
													: String(v)}
										</dd>
									</div>
								))}
							</dl>
						</div>
					)}
					{row && (
						<div className='flex justify-end gap-2 pt-1'>
							{row.ack ? (
								<>
									<span className='text-xs text-muted-foreground flex items-center gap-1'>
										<CheckCircle2 className='h-3 w-3 text-green-500' />
										Reviewed by {row.ack.acknowledged_by_name}
									</span>
									{onUnAck && (
										<Button
											variant='ghost'
											size='sm'
											className='h-6 px-2 text-xs text-muted-foreground hover:text-destructive'
											onClick={e => {
												e.stopPropagation();
												onUnAck(row);
											}}
										>
											<X className='h-3 w-3 mr-1' />
											Remove
										</Button>
									)}
								</>
							) : onAck ? (
								<Button
									variant='outline'
									size='sm'
									className='h-6 px-2 text-xs'
									onClick={e => {
										e.stopPropagation();
										onAck(row);
									}}
								>
									<CheckCircle2 className='h-3 w-3 mr-1' />
									Acknowledge
								</Button>
							) : null}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ─── Acknowledge Dialog ───────────────────────────────────────────────────────

function AcknowledgeFindingDialog({
	open,
	onClose,
	finding,
}: {
	open: boolean;
	onClose: () => void;
	finding: FindingRow | null;
}) {
	const queryClient = useQueryClient();
	const [note, setNote] = useState('');

	const mutation = useMutation({
		mutationFn: () =>
			api.post('/security/findings/ack', {
				scope_key: finding!.scope_key,
				category: finding!.category,
				title: finding!.title,
				note: note.trim() || null,
			}),
		onSuccess: () => {
			toast({ title: 'Finding acknowledged' });
			void queryClient.invalidateQueries({
				queryKey: ['security', 'findings'],
			});
			setNote('');
			onClose();
		},
		onError: () =>
			toast({ title: 'Failed to acknowledge finding', variant: 'destructive' }),
	});

	if (!finding) return null;

	return (
		<Dialog open={open} onOpenChange={v => !v && onClose()}>
			<DialogContent className='max-w-md'>
				<DialogHeader>
					<DialogTitle>Acknowledge finding</DialogTitle>
				</DialogHeader>
				<div className='space-y-3 py-1'>
					<div className='flex items-start gap-2'>
						<SeverityBadge severity={finding.severity} />
						<div className='min-w-0'>
							<p className='text-sm font-medium'>{finding.title}</p>
							<p className='text-xs text-muted-foreground'>
								{finding.category.replace(/_/g, ' ')} ·{' '}
								{finding.server_name ??
									finding.project_name ??
									finding.scope_key}
							</p>
						</div>
					</div>
					<p className='text-sm text-muted-foreground'>{finding.description}</p>
					<div className='space-y-1'>
						<Label className='text-xs'>
							Note{' '}
							<span className='text-muted-foreground font-normal'>
								(optional)
							</span>
						</Label>
						<Textarea
							value={note}
							onChange={e => setNote(e.target.value)}
							placeholder='e.g. Accepted risk — scheduled for Q3 patching cycle'
							className='text-sm resize-none'
							rows={3}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? 'Saving…' : 'Acknowledge'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Findings Tab ─────────────────────────────────────────────────────────────

const SEVERITY_LEVELS: Severity[] = [
	'critical',
	'high',
	'medium',
	'low',
	'info',
];
const SCAN_TYPE_LABELS: Record<string, string> = {
	SSH_AUDIT: 'SSH Audit',
	SERVER_HARDENING: 'Server Hardening',
	MALWARE_SCAN: 'Malware Scan',
	WP_AUDIT: 'WP Audit',
	PROJECT_MALWARE: 'Project Malware',
};

function FindingsTab({
	servers,
	environments,
}: {
	servers: ServerSummary[];
	environments: EnvironmentSummary[];
}) {
	const queryClient = useQueryClient();
	const [sevFilter, setSevFilter] = useState<Severity[]>([]);
	// sourceFilter: '' = all | 'server:ID' | 'environment:ID'
	const [sourceFilter, setSourceFilter] = useState('');
	const [scanTypeFilter, setScanTypeFilter] = useState('all');
	const [showAcked, setShowAcked] = useState(false);
	const [page, setPage] = useState(1);
	const [ackDialog, setAckDialog] = useState<FindingRow | null>(null);

	const params = new URLSearchParams({ page: String(page), limit: '50' });
	if (sevFilter.length > 0) params.set('severity', sevFilter.join(','));
	if (sourceFilter.startsWith('server:'))
		params.set('server_id', sourceFilter.slice(7));
	if (sourceFilter.startsWith('environment:'))
		params.set('environment_id', sourceFilter.slice(12));
	if (scanTypeFilter !== 'all') params.set('scan_type', scanTypeFilter);
	if (showAcked) params.set('acknowledged', 'true');

	const { data, isFetching } = useQuery<FindingsResponse>({
		queryKey: [
			'security',
			'findings',
			sevFilter,
			sourceFilter,
			scanTypeFilter,
			showAcked,
			page,
		],
		queryFn: () => api.get(`/security/findings?${params}`),
	});

	const unAckMutation = useMutation({
		mutationFn: (row: FindingRow) =>
			api.delete('/security/findings/ack', {
				scope_key: row.scope_key,
				category: row.category,
				title: row.title,
			}),
		onSuccess: () => {
			toast({ title: 'Acknowledgement removed' });
			void queryClient.invalidateQueries({
				queryKey: ['security', 'findings'],
			});
		},
		onError: () =>
			toast({
				title: 'Failed to remove acknowledgement',
				variant: 'destructive',
			}),
	});

	const toggleSev = (s: Severity) => {
		setSevFilter(prev =>
			prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s],
		);
		setPage(1);
	};

	const sevColors: Record<Severity, string> = {
		critical:
			'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300',
		high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300',
		medium:
			'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300',
		low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300',
		info: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300',
	};

	return (
		<div className='space-y-4'>
			{/* Filters */}
			<div className='flex flex-wrap gap-3 items-end'>
				{/* Severity toggles */}
				<div className='space-y-1'>
					<Label className='text-xs'>Severity</Label>
					<div className='flex gap-1 flex-wrap'>
						{SEVERITY_LEVELS.map(s => (
							<button
								key={s}
								onClick={() => toggleSev(s)}
								className={`px-2 py-0.5 rounded text-xs font-semibold border transition-opacity ${sevColors[s]} ${sevFilter.length > 0 && !sevFilter.includes(s) ? 'opacity-40' : ''}`}
							>
								{s.toUpperCase()}
							</button>
						))}
						{sevFilter.length > 0 && (
							<button
								onClick={() => {
									setSevFilter([]);
									setPage(1);
								}}
								className='px-2 py-0.5 rounded text-xs border border-muted text-muted-foreground hover:text-foreground'
							>
								Clear
							</button>
						)}
					</div>
				</div>

				{/* Source filter — servers + environments */}
				<div className='space-y-1'>
					<Label className='text-xs'>Source</Label>
					<Select
						value={sourceFilter || 'all'}
						onValueChange={v => {
							setSourceFilter(v === 'all' ? '' : v);
							setPage(1);
						}}
					>
						<SelectTrigger className='w-52 h-8 text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>All sources</SelectItem>
							{servers.length > 0 && (
								<>
									<div className='px-2 pt-1.5 pb-0.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide'>
										Servers
									</div>
									{servers.map(s => (
										<SelectItem key={`server:${s.id}`} value={`server:${s.id}`}>
											{s.name}
										</SelectItem>
									))}
								</>
							)}
							{environments.length > 0 && (
								<>
									<div className='px-2 pt-1.5 pb-0.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide'>
										Environments
									</div>
									{environments.map(e => (
										<SelectItem
											key={`environment:${e.id}`}
											value={`environment:${e.id}`}
										>
											{e.project.name} / {e.type}
										</SelectItem>
									))}
								</>
							)}
						</SelectContent>
					</Select>
				</div>

				{/* Scan type filter */}
				<div className='space-y-1'>
					<Label className='text-xs'>Scan type</Label>
					<Select
						value={scanTypeFilter}
						onValueChange={v => {
							setScanTypeFilter(v);
							setPage(1);
						}}
					>
						<SelectTrigger className='w-44 h-8 text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>All types</SelectItem>
							{Object.entries(SCAN_TYPE_LABELS).map(([v, label]) => (
								<SelectItem key={v} value={v}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Show acknowledged toggle */}
				<div className='flex items-center gap-2 pb-1'>
					<Switch
						checked={showAcked}
						onCheckedChange={v => {
							setShowAcked(v);
							setPage(1);
						}}
						id='show-acked'
					/>
					<Label htmlFor='show-acked' className='text-xs cursor-pointer'>
						Include reviewed
					</Label>
				</div>
			</div>

			{/* Count + loading hint */}
			<div className='flex items-center justify-between text-xs text-muted-foreground'>
				<span>
					{isFetching
						? 'Loading…'
						: `${data?.total ?? 0} finding${(data?.total ?? 0) !== 1 ? 's' : ''}${showAcked ? ' (including reviewed)' : ''}`}
				</span>
			</div>

			{/* List */}
			{data?.data.length === 0 && !isFetching && (
				<div className='text-center py-16 text-muted-foreground'>
					<ShieldCheck className='h-12 w-12 mx-auto mb-3 opacity-30 text-green-500' />
					<p className='font-medium'>No open findings</p>
					<p className='text-sm mt-1'>
						All findings have been reviewed or no scans have been run yet.
					</p>
				</div>
			)}

			<div className='space-y-2'>
				{data?.data.map(row => (
					<FindingItem
						key={`${row.scan_id}-${row.finding_id}`}
						finding={{
							id: row.finding_id,
							severity: row.severity,
							category: row.category as SecurityFinding['category'],
							title: row.title,
							description: row.description,
							remediation: row.remediation,
							resource: row.resource,
							metadata: row.metadata,
						}}
						row={row}
						onAck={r => setAckDialog(r)}
						onUnAck={r => unAckMutation.mutate(r)}
					/>
				))}
			</div>

			{/* Pagination */}
			{data && data.totalPages > 1 && (
				<div className='flex items-center justify-between text-xs text-muted-foreground'>
					<span>
						Page {page} of {data.totalPages}
					</span>
					<div className='flex gap-2'>
						<Button
							variant='outline'
							size='sm'
							className='h-7 text-xs'
							disabled={page <= 1}
							onClick={() => setPage(p => p - 1)}
						>
							Previous
						</Button>
						<Button
							variant='outline'
							size='sm'
							className='h-7 text-xs'
							disabled={page >= data.totalPages}
							onClick={() => setPage(p => p + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			)}

			<AcknowledgeFindingDialog
				open={ackDialog !== null}
				onClose={() => setAckDialog(null)}
				finding={ackDialog}
			/>
		</div>
	);
}

// ─── Scan Trigger Dialog ──────────────────────────────────────────────────────

function ScanDialog({
	open,
	onClose,
	targetType,
	targetId,
	targetName,
}: {
	open: boolean;
	onClose: () => void;
	targetType: 'server' | 'environment';
	targetId: number;
	targetName: string;
}) {
	const queryClient = useQueryClient();
	const defaultTypes =
		targetType === 'server'
			? ['SSH_AUDIT', 'SERVER_HARDENING', 'MALWARE_SCAN']
			: ['WP_AUDIT', 'PROJECT_MALWARE'];

	const [selected, setSelected] = useState<string[]>(defaultTypes);

	const mutation = useMutation({
		mutationFn: (types: string[]) => {
			const url =
				targetType === 'server'
					? `/security/servers/${targetId}/scan`
					: `/security/environments/${targetId}/scan`;
			return api.post(url, { types });
		},
		onSuccess: () => {
			toast({
				title: 'Scan queued',
				description: `Security scan started for ${targetName}`,
			});
			queryClient.invalidateQueries({ queryKey: ['security'] });
			onClose();
		},
		onError: () => {
			toast({ title: 'Failed to queue scan', variant: 'destructive' });
		},
	});

	const allTypes =
		targetType === 'server'
			? ['SSH_AUDIT', 'SERVER_HARDENING', 'MALWARE_SCAN']
			: ['WP_AUDIT', 'PROJECT_MALWARE'];

	const toggle = (t: string) =>
		setSelected(prev =>
			prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t],
		);

	return (
		<Dialog open={open} onOpenChange={v => !v && onClose()}>
			<DialogContent className='max-w-sm'>
				<DialogHeader>
					<DialogTitle>Run Security Scan — {targetName}</DialogTitle>
				</DialogHeader>
				<div className='space-y-2 py-2'>
					{allTypes.map(t => (
						<label key={t} className='flex items-center gap-3 cursor-pointer'>
							<input
								type='checkbox'
								checked={selected.includes(t)}
								onChange={() => toggle(t)}
								className='rounded'
							/>
							<span className='text-sm'>{t.replace(/_/g, ' ')}</span>
						</label>
					))}
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate(selected)}
						disabled={selected.length === 0 || mutation.isPending}
					>
						{mutation.isPending ? 'Queuing…' : 'Start Scan'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Server Scan History Panel ────────────────────────────────────────────────

function ServerScanHistory({ serverId }: { serverId: number }) {
	const { data } = useQuery<ScanHistory>({
		queryKey: ['security', 'server-history', serverId],
		queryFn: () => api.get(`/security/servers/${serverId}/scans?limit=10`),
	});

	if (!data?.data.length)
		return <p className='text-xs text-muted-foreground p-3'>No scans yet.</p>;

	return (
		<div className='divide-y'>
			{data.data.map(scan => (
				<ScanHistoryRow key={scan.id} scan={scan} />
			))}
		</div>
	);
}

function EnvironmentScanHistory({ envId }: { envId: number }) {
	const { data } = useQuery<ScanHistory>({
		queryKey: ['security', 'env-history', envId],
		queryFn: () => api.get(`/security/environments/${envId}/scans?limit=10`),
	});

	if (!data?.data.length)
		return <p className='text-xs text-muted-foreground p-3'>No scans yet.</p>;

	return (
		<div className='divide-y'>
			{data.data.map(scan => (
				<ScanHistoryRow key={scan.id} scan={scan} />
			))}
		</div>
	);
}

function ScanHistoryRow({ scan }: { scan: ScanRecord }) {
	const [expanded, setExpanded] = useState(false);
	const { data: fullScan } = useQuery<ScanRecord>({
		queryKey: ['security', 'scan', scan.id],
		queryFn: () => api.get(`/security/scans/${scan.id}`),
		enabled: expanded && scan.status === 'completed',
	});

	const findings = fullScan?.findings ?? scan.findings ?? [];

	return (
		<div className='px-3 py-2'>
			<div className='flex items-center justify-between gap-2'>
				<div className='flex items-center gap-2 flex-1 min-w-0'>
					<span className='text-xs font-mono font-semibold'>
						{scan.scan_type.replace(/_/g, ' ')}
					</span>
					<StatusDot status={scan.status} />
					{scan.score !== null && <ScoreRing score={scan.score} />}
					{scan.summary && <SummaryBadges summary={scan.summary} />}
				</div>
				<div className='flex items-center gap-2'>
					<span className='text-xs text-muted-foreground whitespace-nowrap'>
						{scan.completed_at
							? new Date(scan.completed_at).toLocaleString()
							: scan.created_at
								? new Date(scan.created_at).toLocaleString()
								: '—'}
					</span>
					{scan.status === 'completed' && findings.length > 0 && (
						<Button
							variant='ghost'
							size='sm'
							className='h-6 px-1.5 text-xs'
							onClick={() => setExpanded(v => !v)}
						>
							{expanded
								? 'Hide'
								: `${findings.length} finding${findings.length !== 1 ? 's' : ''}`}
						</Button>
					)}
					{scan.status === 'failed' && scan.error && (
						<span className='text-xs text-destructive'>
							{scan.error.slice(0, 60)}
						</span>
					)}
				</div>
			</div>
			{expanded && findings.length > 0 && (
				<div className='mt-2 space-y-1'>
					{findings.map(f => (
						<FindingItem key={f.id} finding={f} />
					))}
				</div>
			)}
		</div>
	);
}

function StatusDot({ status }: { status: string }) {
	const classes: Record<string, string> = {
		completed: 'bg-green-500',
		failed: 'bg-red-500',
		running: 'bg-yellow-400 animate-pulse',
		pending: 'bg-gray-400',
		queued: 'bg-gray-400',
	};
	return (
		<span
			className={`inline-block w-2 h-2 rounded-full ${classes[status] ?? 'bg-gray-400'}`}
		/>
	);
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: OverviewData }) {
	const { totals } = data;
	const topServers = [...data.servers]
		.filter(s => s.last_scanned_at)
		.sort((a, b) => {
			const aCrit = a.findings_summary.critical + a.findings_summary.high;
			const bCrit = b.findings_summary.critical + b.findings_summary.high;
			return bCrit - aCrit;
		})
		.slice(0, 3);

	return (
		<div className='space-y-6'>
			{/* Stat cards */}
			<div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
				<Card>
					<CardContent className='p-4'>
						<p className='text-xs text-muted-foreground'>Servers scanned</p>
						<p className='text-2xl font-bold mt-1'>{totals.servers_scanned}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='p-4'>
						<p className='text-xs text-muted-foreground'>
							Environments scanned
						</p>
						<p className='text-2xl font-bold mt-1'>
							{totals.environments_scanned}
						</p>
					</CardContent>
				</Card>
				<Card className='border-red-200 dark:border-red-900'>
					<CardContent className='p-4'>
						<p className='text-xs text-muted-foreground'>Critical findings</p>
						<p className='text-2xl font-bold mt-1 text-red-600 dark:text-red-400'>
							{totals.critical}
						</p>
					</CardContent>
				</Card>
				<Card className='border-orange-200 dark:border-orange-900'>
					<CardContent className='p-4'>
						<p className='text-xs text-muted-foreground'>High findings</p>
						<p className='text-2xl font-bold mt-1 text-orange-500'>
							{totals.high}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Servers needing attention */}
			{topServers.length > 0 && (
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-semibold'>
							Servers needing attention
						</CardTitle>
					</CardHeader>
					<CardContent className='p-0'>
						<div className='divide-y'>
							{topServers.map(s => (
								<div key={s.id} className='flex items-center gap-4 px-4 py-3'>
									<ScoreRing score={s.score} />
									<div className='flex-1 min-w-0'>
										<p className='font-medium text-sm'>{s.name}</p>
										<p className='text-xs text-muted-foreground'>
											{s.ip_address}
										</p>
									</div>
									<SummaryBadges summary={s.findings_summary} />
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{data.servers.length === 0 && (
				<div className='text-center py-16 text-muted-foreground'>
					<ShieldAlert className='h-12 w-12 mx-auto mb-3 opacity-30' />
					<p className='font-medium'>No scans run yet</p>
					<p className='text-sm mt-1'>
						Switch to the Server Security tab and run your first scan.
					</p>
				</div>
			)}
		</div>
	);
}

// ─── Server Security Tab ──────────────────────────────────────────────────────

function ServerSecurityTab({ data }: { data: OverviewData }) {
	const [scanDialog, setScanDialog] = useState<{
		open: boolean;
		serverId: number;
		serverName: string;
	} | null>(null);
	const [expandedId, setExpandedId] = useState<number | null>(null);

	return (
		<div className='space-y-3'>
			{data.servers.map(server => {
				const isExpanded = expandedId === server.id;
				const hasFindings =
					server.findings_summary.critical +
						server.findings_summary.high +
						server.findings_summary.medium +
						server.findings_summary.low >
					0;

				return (
					<Card key={server.id}>
						<CardContent className='p-4'>
							<div className='flex items-center gap-4'>
								<ScoreRing score={server.score} />
								<div className='flex-1 min-w-0'>
									<div className='flex items-center gap-2'>
										<p className='font-semibold text-sm'>{server.name}</p>
										<span className='text-xs text-muted-foreground'>
											{server.ip_address}
										</span>
									</div>
									<SummaryBadges summary={server.findings_summary} />
									{server.last_scanned_at && (
										<p className='text-xs text-muted-foreground mt-1'>
											Last scan:{' '}
											{new Date(server.last_scanned_at).toLocaleString()}
										</p>
									)}
								</div>
								<div className='flex gap-2 shrink-0'>
									{hasFindings && (
										<Button
											variant='ghost'
											size='sm'
											onClick={() =>
												setExpandedId(isExpanded ? null : server.id)
											}
										>
											{isExpanded ? 'Hide' : 'View findings'}
										</Button>
									)}
									<Button
										size='sm'
										variant='outline'
										onClick={() =>
											setScanDialog({
												open: true,
												serverId: server.id,
												serverName: server.name,
											})
										}
									>
										<RefreshCw className='h-3.5 w-3.5 mr-1.5' />
										Scan
									</Button>
								</div>
							</div>

							{isExpanded && (
								<div className='mt-4 border-t pt-4'>
									<ServerScanHistory serverId={server.id} />
								</div>
							)}
						</CardContent>
					</Card>
				);
			})}

			{data.servers.length === 0 && (
				<div className='text-center py-12 text-muted-foreground'>
					<ServerIcon className='h-10 w-10 mx-auto mb-2 opacity-30' />
					<p>No servers found.</p>
				</div>
			)}

			{scanDialog && (
				<ScanDialog
					open={scanDialog.open}
					onClose={() => setScanDialog(null)}
					targetType='server'
					targetId={scanDialog.serverId}
					targetName={scanDialog.serverName}
				/>
			)}
		</div>
	);
}

// ─── Project Security Tab ─────────────────────────────────────────────────────

function ProjectSecurityTab({ data }: { data: OverviewData }) {
	const [scanDialog, setScanDialog] = useState<{
		open: boolean;
		envId: number;
		envName: string;
	} | null>(null);
	const [expandedId, setExpandedId] = useState<number | null>(null);

	// Group environments by project
	const byProject = data.environments.reduce<
		Record<string, EnvironmentSummary[]>
	>((acc, env) => {
		const key = `${env.project.id}:${env.project.name}`;
		if (!acc[key]) acc[key] = [];
		acc[key].push(env);
		return acc;
	}, {});

	return (
		<div className='space-y-4'>
			{Object.entries(byProject).map(([projectKey, envs]) => {
				const projectName = projectKey.split(':').slice(1).join(':');
				return (
					<Card key={projectKey}>
						<CardHeader className='pb-2'>
							<CardTitle className='text-sm flex items-center gap-2'>
								<FolderKanban className='h-4 w-4 text-muted-foreground' />
								{projectName}
							</CardTitle>
						</CardHeader>
						<CardContent className='p-0'>
							<div className='divide-y'>
								{envs.map(env => {
									const isExpanded = expandedId === env.id;
									return (
										<div key={env.id} className='px-4 py-3'>
											<div className='flex items-center gap-4'>
												<ScoreRing score={env.score} />
												<div className='flex-1 min-w-0'>
													<div className='flex items-center gap-2'>
														<Badge variant='outline' className='text-xs'>
															{env.type}
														</Badge>
														<a
															href={env.url}
															target='_blank'
															rel='noreferrer'
															className='text-xs text-muted-foreground hover:underline truncate max-w-xs'
														>
															{env.url}
														</a>
													</div>
													<SummaryBadges summary={env.findings_summary} />
													{env.last_scanned_at && (
														<p className='text-xs text-muted-foreground mt-0.5'>
															Last scan:{' '}
															{new Date(env.last_scanned_at).toLocaleString()}
														</p>
													)}
												</div>
												<div className='flex gap-2 shrink-0'>
													{env.last_scanned_at && (
														<Button
															variant='ghost'
															size='sm'
															onClick={() =>
																setExpandedId(isExpanded ? null : env.id)
															}
														>
															{isExpanded ? 'Hide' : 'History'}
														</Button>
													)}
													<Button
														size='sm'
														variant='outline'
														onClick={() =>
															setScanDialog({
																open: true,
																envId: env.id,
																envName: `${projectName} / ${env.type}`,
															})
														}
													>
														<RefreshCw className='h-3.5 w-3.5 mr-1.5' />
														Scan
													</Button>
												</div>
											</div>
											{isExpanded && (
												<div className='mt-3 border-t pt-3'>
													<EnvironmentScanHistory envId={env.id} />
												</div>
											)}
										</div>
									);
								})}
							</div>
						</CardContent>
					</Card>
				);
			})}

			{data.environments.length === 0 && (
				<div className='text-center py-12 text-muted-foreground'>
					<FolderKanban className='h-10 w-10 mx-auto mb-2 opacity-30' />
					<p>No environments found.</p>
				</div>
			)}

			{scanDialog && (
				<ScanDialog
					open={scanDialog.open}
					onClose={() => setScanDialog(null)}
					targetType='environment'
					targetId={scanDialog.envId}
					targetName={scanDialog.envName}
				/>
			)}
		</div>
	);
}

// ─── Security Logs Tab ────────────────────────────────────────────────────────

function SecurityLogsTab({ servers }: { servers: ServerSummary[] }) {
	const [serverId, setServerId] = useState<string>('all');
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo, setDateTo] = useState('');
	const [page, setPage] = useState(1);

	const params = new URLSearchParams({ page: String(page), limit: '50' });
	if (serverId !== 'all') params.set('server_id', serverId);
	if (dateFrom) params.set('date_from', dateFrom);
	if (dateTo) params.set('date_to', dateTo);

	const { data, isFetching } = useQuery<LogsResponse>({
		queryKey: ['security', 'logs', serverId, dateFrom, dateTo, page],
		queryFn: () => api.get(`/security/logs?${params}`),
	});

	const categoryColors: Record<string, string> = {
		FAILED_LOGINS: 'text-red-500',
		SUCCESSFUL_LOGINS: 'text-green-600',
		AUTHORIZED_KEYS: 'text-orange-500',
	};

	return (
		<div className='space-y-4'>
			{/* Filters */}
			<div className='flex gap-3 flex-wrap items-end'>
				<div className='space-y-1'>
					<Label className='text-xs'>Server</Label>
					<Select
						value={serverId}
						onValueChange={v => {
							setServerId(v);
							setPage(1);
						}}
					>
						<SelectTrigger className='w-48 h-8 text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>All servers</SelectItem>
							{servers.map(s => (
								<SelectItem key={s.id} value={String(s.id)}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className='space-y-1'>
					<Label className='text-xs'>From</Label>
					<Input
						type='date'
						value={dateFrom}
						onChange={e => {
							setDateFrom(e.target.value);
							setPage(1);
						}}
						className='h-8 text-xs w-36'
					/>
				</div>
				<div className='space-y-1'>
					<Label className='text-xs'>To</Label>
					<Input
						type='date'
						value={dateTo}
						onChange={e => {
							setDateTo(e.target.value);
							setPage(1);
						}}
						className='h-8 text-xs w-36'
					/>
				</div>
			</div>

			{/* Table */}
			<div className='border rounded-md overflow-auto'>
				<table className='w-full text-sm'>
					<thead>
						<tr className='border-b bg-muted/50'>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground w-40'>
								Scanned at
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Server
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground w-28'>
								Category
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground w-20'>
								Severity
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Finding
							</th>
						</tr>
					</thead>
					<tbody className='divide-y'>
						{isFetching && (
							<tr>
								<td
									colSpan={5}
									className='text-center py-6 text-muted-foreground text-xs'
								>
									Loading…
								</td>
							</tr>
						)}
						{!isFetching && data?.data.length === 0 && (
							<tr>
								<td
									colSpan={5}
									className='text-center py-10 text-muted-foreground'
								>
									No SSH/auth events found. Run an SSH_AUDIT scan to populate
									this log.
								</td>
							</tr>
						)}
						{data?.data.map((log, i) => (
							<tr
								key={i}
								className={`hover:bg-muted/30 ${log.severity === 'critical' ? 'bg-red-50/40 dark:bg-red-950/20' : ''}`}
							>
								<td className='px-3 py-2 text-xs text-muted-foreground whitespace-nowrap'>
									{log.scanned_at
										? new Date(log.scanned_at).toLocaleString()
										: '—'}
								</td>
								<td className='px-3 py-2 text-xs'>
									<p className='font-medium'>{log.server_name ?? '—'}</p>
									{log.server_ip && (
										<p className='text-muted-foreground'>{log.server_ip}</p>
									)}
								</td>
								<td className='px-3 py-2'>
									<span
										className={`text-xs font-medium ${categoryColors[log.category] ?? 'text-muted-foreground'}`}
									>
										{log.category.replace(/_/g, ' ')}
									</span>
								</td>
								<td className='px-3 py-2'>
									<SeverityBadge severity={log.severity} />
								</td>
								<td className='px-3 py-2 text-xs'>
									<p className='font-medium'>{log.title}</p>
									<p className='text-muted-foreground line-clamp-1'>
										{log.description}
									</p>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Pagination */}
			{data && data.totalPages > 1 && (
				<div className='flex items-center justify-between text-xs text-muted-foreground'>
					<span>
						{data.total} result{data.total !== 1 ? 's' : ''}
					</span>
					<div className='flex gap-2'>
						<Button
							variant='outline'
							size='sm'
							className='h-7 text-xs'
							disabled={page <= 1}
							onClick={() => setPage(p => p - 1)}
						>
							Previous
						</Button>
						<span className='flex items-center px-2'>
							{page} / {data.totalPages}
						</span>
						<Button
							variant='outline'
							size='sm'
							className='h-7 text-xs'
							disabled={page >= data.totalPages}
							onClick={() => setPage(p => p + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Schedule Dialog ──────────────────────────────────────────────────────────

const SCAN_TYPES_BY_KIND = {
	server: ['SSH_AUDIT', 'SERVER_HARDENING', 'MALWARE_SCAN'],
	environment: ['WP_AUDIT', 'PROJECT_MALWARE'],
};

function ScheduleDialog({
	open,
	onClose,
	targetType,
	targetId,
	targetName,
}: {
	open: boolean;
	onClose: () => void;
	targetType: 'server' | 'environment';
	targetId: number;
	targetName: string;
}) {
	const queryClient = useQueryClient();
	const plural = targetType === 'server' ? 'servers' : 'environments';
	const scheduleKey = ['security', 'schedule', targetType, targetId];

	const { data: existing, isLoading } = useQuery<SecuritySchedule | null>({
		queryKey: scheduleKey,
		queryFn: async () => {
			try {
				return await api.get<SecuritySchedule>(
					`/security/schedules/${plural}/${targetId}`,
				);
			} catch {
				return null;
			}
		},
		enabled: open,
	});

	const allTypes = SCAN_TYPES_BY_KIND[targetType];

	const [form, setForm] = useState<SecuritySchedule>({
		scan_types: allTypes,
		frequency: 'daily',
		hour: 2,
		minute: 0,
		enabled: true,
		notify_enabled: false,
		notify_threshold: 'high',
	});

	// Sync form from fetched data
	const [synced, setSynced] = useState(false);
	if (existing && !synced && !isLoading) {
		setForm(existing);
		setSynced(true);
	}
	if (!open && synced) setSynced(false);

	const upsert = useMutation({
		mutationFn: () =>
			api.put(`/security/schedules/${plural}/${targetId}`, form),
		onSuccess: () => {
			toast({ title: 'Schedule saved' });
			queryClient.invalidateQueries({ queryKey: ['security', 'schedule'] });
			onClose();
		},
		onError: () =>
			toast({ title: 'Failed to save schedule', variant: 'destructive' }),
	});

	const remove = useMutation({
		mutationFn: () => api.delete(`/security/schedules/${plural}/${targetId}`),
		onSuccess: () => {
			toast({ title: 'Schedule removed' });
			queryClient.invalidateQueries({ queryKey: ['security', 'schedule'] });
			onClose();
		},
		onError: () =>
			toast({ title: 'Failed to remove schedule', variant: 'destructive' }),
	});

	const toggleType = (t: string) =>
		setForm(f => ({
			...f,
			scan_types: f.scan_types.includes(t)
				? f.scan_types.filter(x => x !== t)
				: [...f.scan_types, t],
		}));

	return (
		<Dialog open={open} onOpenChange={v => !v && onClose()}>
			<DialogContent className='max-w-md'>
				<DialogHeader>
					<DialogTitle>
						{existing ? 'Edit' : 'Create'} Schedule — {targetName}
					</DialogTitle>
				</DialogHeader>
				{isLoading ? (
					<div className='flex justify-center py-8'>
						<RefreshCw className='h-5 w-5 animate-spin text-muted-foreground' />
					</div>
				) : (
					<div className='space-y-4 py-2'>
						{/* Scan types */}
						<div className='space-y-1.5'>
							<Label className='text-xs font-medium'>Scan types</Label>
							<div className='flex flex-wrap gap-3'>
								{allTypes.map(t => (
									<label
										key={t}
										className='flex items-center gap-2 cursor-pointer'
									>
										<input
											type='checkbox'
											checked={form.scan_types.includes(t)}
											onChange={() => toggleType(t)}
											className='rounded'
										/>
										<span className='text-sm'>{t.replace(/_/g, ' ')}</span>
									</label>
								))}
							</div>
						</div>

						{/* Frequency */}
						<div className='grid grid-cols-2 gap-3'>
							<div className='space-y-1'>
								<Label className='text-xs'>Frequency</Label>
								<Select
									value={form.frequency}
									onValueChange={v =>
										setForm(f => ({
											...f,
											frequency: v as SecuritySchedule['frequency'],
										}))
									}
								>
									<SelectTrigger className='h-8 text-xs'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='daily'>Daily</SelectItem>
										<SelectItem value='weekly'>Weekly</SelectItem>
										<SelectItem value='monthly'>Monthly</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className='space-y-1'>
								<Label className='text-xs'>Time (UTC)</Label>
								<div className='flex gap-1'>
									<Input
										type='number'
										min={0}
										max={23}
										value={form.hour}
										onChange={e =>
											setForm(f => ({ ...f, hour: Number(e.target.value) }))
										}
										className='h-8 text-xs w-16'
										placeholder='HH'
									/>
									<span className='flex items-center text-muted-foreground px-0.5'>
										:
									</span>
									<Input
										type='number'
										min={0}
										max={59}
										step={5}
										value={form.minute}
										onChange={e =>
											setForm(f => ({ ...f, minute: Number(e.target.value) }))
										}
										className='h-8 text-xs w-16'
										placeholder='MM'
									/>
								</div>
							</div>
						</div>

						{form.frequency === 'weekly' && (
							<div className='space-y-1'>
								<Label className='text-xs'>Day of week</Label>
								<Select
									value={String(form.day_of_week ?? 1)}
									onValueChange={v =>
										setForm(f => ({ ...f, day_of_week: Number(v) }))
									}
								>
									<SelectTrigger className='h-8 text-xs'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
											(d, i) => (
												<SelectItem key={i} value={String(i)}>
													{d}
												</SelectItem>
											),
										)}
									</SelectContent>
								</Select>
							</div>
						)}

						{form.frequency === 'monthly' && (
							<div className='space-y-1'>
								<Label className='text-xs'>Day of month</Label>
								<Input
									type='number'
									min={1}
									max={28}
									value={form.day_of_month ?? 1}
									onChange={e =>
										setForm(f => ({
											...f,
											day_of_month: Number(e.target.value),
										}))
									}
									className='h-8 text-xs w-20'
								/>
							</div>
						)}

						{/* Toggles */}
						<div className='flex items-center justify-between'>
							<Label className='text-sm'>Enabled</Label>
							<Switch
								checked={form.enabled}
								onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))}
							/>
						</div>
						<div className='flex items-center justify-between'>
							<Label className='text-sm'>Notify on findings</Label>
							<Switch
								checked={form.notify_enabled}
								onCheckedChange={v =>
									setForm(f => ({ ...f, notify_enabled: v }))
								}
							/>
						</div>
						{form.notify_enabled && (
							<div className='space-y-1'>
								<Label className='text-xs'>Notify threshold</Label>
								<Select
									value={form.notify_threshold}
									onValueChange={v =>
										setForm(f => ({ ...f, notify_threshold: v }))
									}
								>
									<SelectTrigger className='h-8 text-xs'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{['critical', 'high', 'medium', 'low', 'info'].map(t => (
											<SelectItem key={t} value={t}>
												{t.charAt(0).toUpperCase() + t.slice(1)} and above
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
				)}
				<DialogFooter className='flex justify-between'>
					<div>
						{existing && (
							<Button
								variant='destructive'
								size='sm'
								onClick={() => remove.mutate()}
								disabled={remove.isPending}
							>
								<Trash2 className='h-3.5 w-3.5 mr-1.5' />
								Remove
							</Button>
						)}
					</div>
					<div className='flex gap-2'>
						<Button variant='outline' onClick={onClose}>
							Cancel
						</Button>
						<Button
							onClick={() => upsert.mutate()}
							disabled={
								form.scan_types.length === 0 || upsert.isPending || isLoading
							}
						>
							{upsert.isPending ? 'Saving…' : 'Save Schedule'}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Server Schedules Tab ─────────────────────────────────────────────────────

function ServerSchedulesTab({ data }: { data: OverviewData }) {
	const [dialog, setDialog] = useState<{
		serverId: number;
		serverName: string;
	} | null>(null);

	return (
		<div className='space-y-3'>
			<p className='text-sm text-muted-foreground'>
				Configure automated security scans per server. Schedules are checked
				every 15 minutes.
			</p>
			<div className='border rounded-md overflow-hidden'>
				<table className='w-full text-sm'>
					<thead>
						<tr className='border-b bg-muted/50'>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Server
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell'>
								Last scan
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Schedule
							</th>
							<th className='px-3 py-2 w-8' />
						</tr>
					</thead>
					<tbody className='divide-y'>
						{data.servers.map(server => (
							<ServerScheduleRow
								key={server.id}
								server={server}
								onEdit={() =>
									setDialog({ serverId: server.id, serverName: server.name })
								}
							/>
						))}
						{data.servers.length === 0 && (
							<tr>
								<td
									colSpan={4}
									className='text-center py-8 text-muted-foreground text-xs'
								>
									No servers found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{dialog && (
				<ScheduleDialog
					open
					onClose={() => setDialog(null)}
					targetType='server'
					targetId={dialog.serverId}
					targetName={dialog.serverName}
				/>
			)}
		</div>
	);
}

function ServerScheduleRow({
	server,
	onEdit,
}: {
	server: ServerSummary;
	onEdit: () => void;
}) {
	const { data: schedule } = useQuery<SecuritySchedule | null>({
		queryKey: ['security', 'schedule', 'server', server.id],
		queryFn: async () => {
			try {
				return await api.get<SecuritySchedule>(
					`/security/schedules/servers/${server.id}`,
				);
			} catch {
				return null;
			}
		},
	});

	return (
		<tr className='hover:bg-muted/30'>
			<td className='px-3 py-2'>
				<p className='font-medium text-sm'>{server.name}</p>
				<p className='text-xs text-muted-foreground'>{server.ip_address}</p>
			</td>
			<td className='px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell'>
				{server.last_scanned_at
					? new Date(server.last_scanned_at).toLocaleString()
					: 'Never'}
			</td>
			<td className='px-3 py-2'>
				{schedule ? (
					<div className='flex items-center gap-2'>
						<Clock className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
						<span className='text-xs'>
							{schedule.frequency.charAt(0).toUpperCase() +
								schedule.frequency.slice(1)}{' '}
							at {String(schedule.hour).padStart(2, '0')}:
							{String(schedule.minute).padStart(2, '0')} UTC
						</span>
						{!schedule.enabled && (
							<Badge variant='outline' className='text-xs px-1 py-0'>
								Disabled
							</Badge>
						)}
					</div>
				) : (
					<span className='text-xs text-muted-foreground'>Not configured</span>
				)}
			</td>
			<td className='px-3 py-2 text-right'>
				<Button variant='ghost' size='sm' className='h-7 px-2' onClick={onEdit}>
					{schedule ? 'Edit' : <Plus className='h-3.5 w-3.5' />}
				</Button>
			</td>
		</tr>
	);
}

// ─── Project Schedules Tab ────────────────────────────────────────────────────

function ProjectSchedulesTab({ data }: { data: OverviewData }) {
	const [dialog, setDialog] = useState<{
		envId: number;
		envName: string;
	} | null>(null);

	return (
		<div className='space-y-3'>
			<p className='text-sm text-muted-foreground'>
				Configure automated WordPress security scans per environment.
			</p>
			<div className='border rounded-md overflow-hidden'>
				<table className='w-full text-sm'>
					<thead>
						<tr className='border-b bg-muted/50'>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Environment
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell'>
								Last scan
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Schedule
							</th>
							<th className='px-3 py-2 w-8' />
						</tr>
					</thead>
					<tbody className='divide-y'>
						{data.environments.map(env => (
							<EnvironmentScheduleRow
								key={env.id}
								env={env}
								onEdit={() =>
									setDialog({
										envId: env.id,
										envName: `${env.project.name} / ${env.type}`,
									})
								}
							/>
						))}
						{data.environments.length === 0 && (
							<tr>
								<td
									colSpan={4}
									className='text-center py-8 text-muted-foreground text-xs'
								>
									No environments found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{dialog && (
				<ScheduleDialog
					open
					onClose={() => setDialog(null)}
					targetType='environment'
					targetId={dialog.envId}
					targetName={dialog.envName}
				/>
			)}
		</div>
	);
}

function EnvironmentScheduleRow({
	env,
	onEdit,
}: {
	env: EnvironmentSummary;
	onEdit: () => void;
}) {
	const { data: schedule } = useQuery<SecuritySchedule | null>({
		queryKey: ['security', 'schedule', 'environment', env.id],
		queryFn: async () => {
			try {
				return await api.get<SecuritySchedule>(
					`/security/schedules/environments/${env.id}`,
				);
			} catch {
				return null;
			}
		},
	});

	return (
		<tr className='hover:bg-muted/30'>
			<td className='px-3 py-2'>
				<p className='font-medium text-sm'>
					{env.project.name}{' '}
					<Badge variant='outline' className='text-xs ml-1'>
						{env.type}
					</Badge>
				</p>
				<a
					href={env.url}
					target='_blank'
					rel='noreferrer'
					className='text-xs text-muted-foreground hover:underline truncate max-w-xs block'
				>
					{env.url}
				</a>
			</td>
			<td className='px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell'>
				{env.last_scanned_at
					? new Date(env.last_scanned_at).toLocaleString()
					: 'Never'}
			</td>
			<td className='px-3 py-2'>
				{schedule ? (
					<div className='flex items-center gap-2'>
						<Clock className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
						<span className='text-xs'>
							{schedule.frequency.charAt(0).toUpperCase() +
								schedule.frequency.slice(1)}{' '}
							at {String(schedule.hour).padStart(2, '0')}:
							{String(schedule.minute).padStart(2, '0')} UTC
						</span>
						{!schedule.enabled && (
							<Badge variant='outline' className='text-xs px-1 py-0'>
								Disabled
							</Badge>
						)}
					</div>
				) : (
					<span className='text-xs text-muted-foreground'>Not configured</span>
				)}
			</td>
			<td className='px-3 py-2 text-right'>
				<Button variant='ghost' size='sm' className='h-7 px-2' onClick={onEdit}>
					{schedule ? 'Edit' : <Plus className='h-3.5 w-3.5' />}
				</Button>
			</td>
		</tr>
	);
}

// ─── Recommendations Tab ──────────────────────────────────────────────────────

function RecommendationsTab({ data }: { data: OverviewData }) {
	const atRiskServers = data.servers.filter(
		s => s.findings_summary.critical + s.findings_summary.high > 0,
	);
	const atRiskEnvs = data.environments.filter(
		e => e.findings_summary.critical + e.findings_summary.high > 0,
	);

	if (atRiskServers.length === 0 && atRiskEnvs.length === 0) {
		return (
			<div className='text-center py-16 text-muted-foreground'>
				<ShieldCheck className='h-12 w-12 mx-auto mb-3 opacity-30 text-green-500' />
				<p className='font-medium'>No critical or high findings</p>
				<p className='text-sm mt-1'>
					All scanned servers and projects are looking good.
				</p>
			</div>
		);
	}

	return (
		<div className='space-y-4'>
			{atRiskServers.length > 0 && (
				<div>
					<h3 className='text-sm font-semibold mb-2 flex items-center gap-2'>
						<ServerIcon className='h-4 w-4 text-muted-foreground' />
						Servers
					</h3>
					<div className='space-y-2'>
						{atRiskServers.map(s => (
							<RecommendationServerCard key={s.id} server={s} />
						))}
					</div>
				</div>
			)}
			{atRiskEnvs.length > 0 && (
				<div>
					<h3 className='text-sm font-semibold mb-2 flex items-center gap-2'>
						<FolderKanban className='h-4 w-4 text-muted-foreground' />
						Environments
					</h3>
					<div className='space-y-2'>
						{atRiskEnvs.map(e => (
							<RecommendationEnvCard key={e.id} env={e} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function RecommendationServerCard({ server }: { server: ServerSummary }) {
	const [expanded, setExpanded] = useState(false);

	const { data: history } = useQuery<ScanHistory>({
		queryKey: ['security', 'server-history', server.id],
		queryFn: () => api.get(`/security/servers/${server.id}/scans?limit=5`),
		enabled: expanded,
	});

	const criticalAndHigh = (history?.data ?? []).flatMap(scan => {
		const findings = (scan.findings ?? []).filter(
			f => f.severity === 'critical' || f.severity === 'high',
		);
		return findings;
	});

	return (
		<Card>
			<CardContent className='p-4'>
				<div className='flex items-center gap-3'>
					<ScoreRing score={server.score} />
					<div className='flex-1 min-w-0'>
						<p className='font-medium text-sm'>{server.name}</p>
						<SummaryBadges summary={server.findings_summary} />
					</div>
					<Button
						variant='ghost'
						size='sm'
						onClick={() => setExpanded(v => !v)}
					>
						{expanded ? 'Hide' : 'View findings'}
						{expanded ? (
							<ChevronDown className='h-3.5 w-3.5 ml-1.5' />
						) : (
							<ChevronRight className='h-3.5 w-3.5 ml-1.5' />
						)}
					</Button>
				</div>
				{expanded && (
					<div className='mt-3 border-t pt-3 space-y-1'>
						{criticalAndHigh.length === 0 ? (
							<p className='text-xs text-muted-foreground'>
								No critical/high findings in recent scans.
							</p>
						) : (
							criticalAndHigh.map(f => <FindingItem key={f.id} finding={f} />)
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function RecommendationEnvCard({ env }: { env: EnvironmentSummary }) {
	const [expanded, setExpanded] = useState(false);

	const { data: history } = useQuery<ScanHistory>({
		queryKey: ['security', 'env-history', env.id],
		queryFn: () => api.get(`/security/environments/${env.id}/scans?limit=5`),
		enabled: expanded,
	});

	const criticalAndHigh = (history?.data ?? []).flatMap(scan =>
		(scan.findings ?? []).filter(
			f => f.severity === 'critical' || f.severity === 'high',
		),
	);

	return (
		<Card>
			<CardContent className='p-4'>
				<div className='flex items-center gap-3'>
					<ScoreRing score={env.score} />
					<div className='flex-1 min-w-0'>
						<p className='font-medium text-sm'>
							{env.project.name}{' '}
							<Badge variant='outline' className='text-xs ml-1'>
								{env.type}
							</Badge>
						</p>
						<SummaryBadges summary={env.findings_summary} />
					</div>
					<Button
						variant='ghost'
						size='sm'
						onClick={() => setExpanded(v => !v)}
					>
						{expanded ? 'Hide' : 'View findings'}
						{expanded ? (
							<ChevronDown className='h-3.5 w-3.5 ml-1.5' />
						) : (
							<ChevronRight className='h-3.5 w-3.5 ml-1.5' />
						)}
					</Button>
				</div>
				{expanded && (
					<div className='mt-3 border-t pt-3 space-y-1'>
						{criticalAndHigh.length === 0 ? (
							<p className='text-xs text-muted-foreground'>
								No critical/high findings in recent scans.
							</p>
						) : (
							criticalAndHigh.map(f => <FindingItem key={f.id} finding={f} />)
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ─── Forge Security Tab ───────────────────────────────────────────────────────

function ForgeSecurityTab() {
	const queryClient = useQueryClient();

	const { data: settings, isLoading } = useQuery<SecuritySettings>({
		queryKey: ['security', 'settings'],
		queryFn: () => api.get('/security/settings'),
	});

	const [ipInput, setIpInput] = useState('');
	const [cidrError, setCidrError] = useState('');
	const [localIpList, setLocalIpList] = useState<string[] | null>(null);
	const [localThreshold, setLocalThreshold] = useState<string | null>(null);

	const ipList = localIpList ?? settings?.ip_allowlist ?? [];
	const threshold = localThreshold ?? settings?.notify_threshold ?? 'high';

	const saveMutation = useMutation({
		mutationFn: () =>
			api.put('/security/settings', {
				ip_allowlist: ipList,
				notify_threshold: threshold,
			}),
		onSuccess: () => {
			toast({ title: 'Security settings saved' });
			setLocalIpList(null);
			setLocalThreshold(null);
			queryClient.invalidateQueries({ queryKey: ['security', 'settings'] });
		},
		onError: () =>
			toast({ title: 'Failed to save settings', variant: 'destructive' }),
	});

	const CIDR_RE =
		/^(\d{1,3}\.){3}\d{1,3}(\/([12]?\d|3[0-2]))?$|^[0-9a-fA-F:]+(?:\/(?:12[0-8]|1[01]\d|[1-9]\d|\d))?$/;

	const addCidr = () => {
		const cidr = ipInput.trim();
		if (!cidr) return;
		if (ipList.includes(cidr)) {
			setCidrError('This IP/range is already in the list.');
			return;
		}
		if (!CIDR_RE.test(cidr)) {
			setCidrError(
				'Invalid format — use an IPv4/IPv6 address or CIDR range (e.g. 203.0.113.0/24)',
			);
			return;
		}
		setCidrError('');
		setLocalIpList([...ipList, cidr]);
		setIpInput('');
	};

	const removeCidr = (cidr: string) =>
		setLocalIpList(ipList.filter(x => x !== cidr));

	const isDirty = localIpList !== null || localThreshold !== null;

	if (isLoading) {
		return (
			<div className='flex justify-center py-16'>
				<RefreshCw className='h-5 w-5 animate-spin text-muted-foreground' />
			</div>
		);
	}

	return (
		<div className='space-y-6 max-w-2xl'>
			{/* IP Allowlist */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='text-sm flex items-center gap-2'>
						<Lock className='h-4 w-4 text-muted-foreground' />
						IP Allowlist
					</CardTitle>
					<p className='text-xs text-muted-foreground'>
						Restrict API access to specific IP ranges. Leave empty to allow all
						IPs. Docker/localhost ranges are always allowed.
					</p>
				</CardHeader>
				<CardContent className='space-y-3'>
					<div className='flex gap-2'>
						<Input
							value={ipInput}
							onChange={e => {
								setIpInput(e.target.value);
								if (cidrError) setCidrError('');
							}}
							placeholder='e.g. 203.0.113.0/24 or 198.51.100.42'
							className='h-8 text-xs flex-1'
							onKeyDown={e => e.key === 'Enter' && addCidr()}
						/>
						<Button
							variant='outline'
							size='sm'
							className='h-8'
							onClick={addCidr}
							disabled={!ipInput.trim()}
						>
							<Plus className='h-3.5 w-3.5 mr-1' />
							Add
						</Button>
					</div>
					{cidrError && <p className='text-xs text-destructive'>{cidrError}</p>}
					{ipList.length === 0 ? (
						<p className='text-xs text-muted-foreground italic'>
							No restrictions — all IPs allowed.
						</p>
					) : (
						<div className='space-y-1'>
							{ipList.map(cidr => (
								<div
									key={cidr}
									className='flex items-center justify-between px-2.5 py-1.5 rounded bg-muted/50 text-xs font-mono'
								>
									<span>{cidr}</span>
									<button
										onClick={() => removeCidr(cidr)}
										className='text-muted-foreground hover:text-destructive ml-3'
									>
										<Trash2 className='h-3.5 w-3.5' />
									</button>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Notification Threshold */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='text-sm flex items-center gap-2'>
						<Settings2 className='h-4 w-4 text-muted-foreground' />
						Global Alert Threshold
					</CardTitle>
					<p className='text-xs text-muted-foreground'>
						Minimum severity level that triggers global security notifications.
						Per-schedule thresholds override this.
					</p>
				</CardHeader>
				<CardContent>
					<Select value={threshold} onValueChange={v => setLocalThreshold(v)}>
						<SelectTrigger className='w-48 h-8 text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{['critical', 'high', 'medium', 'low', 'info'].map(t => (
								<SelectItem key={t} value={t}>
									{t.charAt(0).toUpperCase() + t.slice(1)} and above
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			<div className='flex justify-end'>
				<Button
					onClick={() => saveMutation.mutate()}
					disabled={!isDirty || saveMutation.isPending}
				>
					{saveMutation.isPending ? 'Saving…' : 'Save Settings'}
				</Button>
			</div>
		</div>
	);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SecurityPage() {
	const queryClient = useQueryClient();

	const { data: overview, isFetching } = useQuery<OverviewData>({
		queryKey: ['security', 'overview'],
		queryFn: () => api.get('/security/overview'),
		refetchInterval: 30_000,
	});

	const handleRefresh = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ['security'] });
	}, [queryClient]);

	return (
		<div className='space-y-4'>
			<PageHeader title='Security'>
				<Button
					variant='outline'
					size='sm'
					onClick={handleRefresh}
					disabled={isFetching}
				>
					<RefreshCw
						className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`}
					/>
					Refresh
				</Button>
			</PageHeader>

			<Tabs defaultValue='overview'>
				<TabsList className='flex-wrap h-auto gap-1'>
					<TabsTrigger value='overview'>
						<Shield className='h-3.5 w-3.5 mr-1.5' />
						Overview
					</TabsTrigger>
					<TabsTrigger value='servers'>
						<ServerIcon className='h-3.5 w-3.5 mr-1.5' />
						Servers
					</TabsTrigger>
					<TabsTrigger value='server-schedules'>
						<Clock className='h-3.5 w-3.5 mr-1.5' />
						Server Schedules
					</TabsTrigger>
					<TabsTrigger value='projects'>
						<FolderKanban className='h-3.5 w-3.5 mr-1.5' />
						Projects
					</TabsTrigger>
					<TabsTrigger value='project-schedules'>
						<Clock className='h-3.5 w-3.5 mr-1.5' />
						Project Schedules
					</TabsTrigger>
					<TabsTrigger value='logs'>
						<ClipboardListIcon className='h-3.5 w-3.5 mr-1.5' />
						SSH Logs
					</TabsTrigger>
					<TabsTrigger value='recommendations'>
						<ShieldAlert className='h-3.5 w-3.5 mr-1.5' />
						Recommendations
					</TabsTrigger>
					<TabsTrigger value='findings'>
						<ListFilter className='h-3.5 w-3.5 mr-1.5' />
						Findings
					</TabsTrigger>
					<TabsTrigger value='forge-security'>
						<Lock className='h-3.5 w-3.5 mr-1.5' />
						Forge Security
					</TabsTrigger>
					<TabsTrigger value='sessions'>
						<Monitor className='h-3.5 w-3.5 mr-1.5' />
						Sessions
					</TabsTrigger>
				</TabsList>

				<div className='mt-4'>
					{!overview && isFetching && (
						<div className='flex justify-center py-16'>
							<RefreshCw className='h-6 w-6 animate-spin text-muted-foreground' />
						</div>
					)}

					{overview && (
						<>
							<TabsContent value='overview'>
								<OverviewTab data={overview} />
							</TabsContent>
							<TabsContent value='servers'>
								<ServerSecurityTab data={overview} />
							</TabsContent>
							<TabsContent value='server-schedules'>
								<ServerSchedulesTab data={overview} />
							</TabsContent>
							<TabsContent value='projects'>
								<ProjectSecurityTab data={overview} />
							</TabsContent>
							<TabsContent value='project-schedules'>
								<ProjectSchedulesTab data={overview} />
							</TabsContent>
							<TabsContent value='logs'>
								<SecurityLogsTab servers={overview.servers} />
							</TabsContent>
							<TabsContent value='recommendations'>
								<RecommendationsTab data={overview} />
							</TabsContent>
							<TabsContent value='findings'>
								<FindingsTab
									servers={overview.servers}
									environments={overview.environments}
								/>
							</TabsContent>
						</>
					)}
					<TabsContent value='forge-security'>
						<ForgeSecurityTab />
					</TabsContent>
					<TabsContent value='sessions'>
						<SessionsTab />
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}

// ─── Sessions Tab ────────────────────────────────────────────────────────────────────────────────

function SessionsTab() {
	const queryClient = useQueryClient();

	const { data: sessions, isLoading } = useQuery<SessionItem[]>({
		queryKey: ['auth', 'sessions'],
		queryFn: () => api.get('/auth/sessions'),
		refetchInterval: 60_000,
	});

	const revokeMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/auth/sessions/${id}`),
		onSuccess: () => {
			toast({ title: 'Session revoked' });
			void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
		},
		onError: () =>
			toast({ title: 'Failed to revoke session', variant: 'destructive' }),
	});

	const logoutAllMutation = useMutation({
		mutationFn: () => api.post('/auth/logout-all', {}),
		onSuccess: () => {
			toast({ title: 'All sessions signed out' });
			void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
		},
		onError: () =>
			toast({
				title: 'Failed to sign out all devices',
				variant: 'destructive',
			}),
	});

	const parseUa = (ua: string | null) => {
		if (!ua) return 'Unknown device';
		const chrome = /Chrome\/([\.\d]+)/.exec(ua);
		if (chrome && !ua.includes('Edg') && !ua.includes('OPR'))
			return `Chrome ${chrome[1]}`;
		const firefox = /Firefox\/([\.\d]+)/.exec(ua);
		if (firefox) return `Firefox ${firefox[1]}`;
		const edge = /Edg\/([\.\d]+)/.exec(ua);
		if (edge) return `Edge ${edge[1]}`;
		if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
		return ua.slice(0, 60);
	};

	return (
		<div className='space-y-4 max-w-2xl'>
			<div className='flex items-start justify-between gap-4'>
				<p className='text-sm text-muted-foreground'>
					Active sessions authenticated to your account. Revoking a session
					signs that device out immediately.
				</p>
				<Button
					variant='destructive'
					size='sm'
					className='shrink-0'
					onClick={() => logoutAllMutation.mutate()}
					disabled={logoutAllMutation.isPending}
				>
					Sign out all devices
				</Button>
			</div>
			<div className='border rounded-md overflow-hidden'>
				{isLoading ? (
					<div className='flex justify-center py-8'>
						<RefreshCw className='h-5 w-5 animate-spin text-muted-foreground' />
					</div>
				) : (
					<table className='w-full text-sm'>
						<thead>
							<tr className='border-b bg-muted/50'>
								<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
									Device / Browser
								</th>
								<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell'>
									IP Address
								</th>
								<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden md:table-cell'>
									Created
								</th>
								<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden md:table-cell'>
									Expires
								</th>
								<th className='px-3 py-2 w-20' />
							</tr>
						</thead>
						<tbody className='divide-y'>
							{!sessions?.length && (
								<tr>
									<td
										colSpan={5}
										className='text-center py-8 text-muted-foreground text-xs'
									>
										No active sessions.
									</td>
								</tr>
							)}
							{sessions?.map(s => (
								<tr key={s.id} className='hover:bg-muted/30'>
									<td className='px-3 py-2'>
										<p className='text-xs'>{parseUa(s.user_agent)}</p>
									</td>
									<td className='px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell font-mono'>
										{s.ip_address ?? '—'}
									</td>
									<td className='px-3 py-2 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap'>
										{new Date(s.created_at).toLocaleString()}
									</td>
									<td className='px-3 py-2 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap'>
										{new Date(s.expires_at).toLocaleString()}
									</td>
									<td className='px-3 py-2 text-right'>
										<Button
											variant='ghost'
											size='sm'
											className='h-7 px-2 text-xs text-destructive hover:text-destructive'
											onClick={() => revokeMutation.mutate(s.id)}
											disabled={
												revokeMutation.isPending &&
												revokeMutation.variables === s.id
											}
										>
											Revoke
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}

function ClipboardListIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			{...props}
		>
			<rect x='8' y='2' width='8' height='4' rx='1' ry='1' />
			<path d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' />
			<path d='M12 11h4' />
			<path d='M12 16h4' />
			<path d='M8 11h.01' />
			<path d='M8 16h.01' />
		</svg>
	);
}
