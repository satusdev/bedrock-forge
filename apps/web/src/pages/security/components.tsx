import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ShieldX,
	AlertTriangle,
	Info,
	ChevronDown,
	ChevronRight,
	CheckCircle2,
	X,
	Wrench,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import type {
	Severity,
	SecurityFinding,
	FindingRow,
	ScanSummary,
} from './types';
import { getFixAction, formatScanType } from './utils';

// ─── SeverityBadge ────────────────────────────────────────────────────────────

export function SeverityBadge({ severity }: { severity: Severity }) {
	const variants: Record<Severity, string> = {
		critical: 'bg-destructive/10 text-destructive',
		high: 'bg-destructive/10 text-destructive',
		medium: 'bg-warning/10 text-warning',
		low: 'bg-info/10 text-info',
		info: 'bg-muted text-muted-foreground',
	};
	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${variants[severity]}`}
			aria-label={`Severity: ${severity}`}
		>
			{severity.toUpperCase()}
		</span>
	);
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────

export function ScoreRing({ score }: { score: number | null }) {
	if (score === null) {
		return (
			<div
				className='w-14 h-14 rounded-full border-4 border-muted flex items-center justify-center text-xs text-muted-foreground font-semibold'
				aria-label='Score not available'
			>
				N/A
			</div>
		);
	}
	const color =
		score >= 80
			? 'hsl(var(--success))'
			: score >= 60
				? 'hsl(var(--warning))'
				: score >= 40
					? 'hsl(var(--warning))'
					: 'hsl(var(--destructive))';
	const r = 22;
	const circ = 2 * Math.PI * r;
	const dash = (score / 100) * circ;
	return (
		<div className='relative w-14 h-14' aria-label={`Security score: ${score}`}>
			<svg
				viewBox='0 0 56 56'
				className='absolute inset-0 -rotate-90'
				width='56'
				height='56'
				aria-hidden='true'
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

// ─── SummaryBadges ────────────────────────────────────────────────────────────

export function SummaryBadges({ summary }: { summary: ScanSummary }) {
	if (!summary) return null;
	return (
		<div className='flex gap-1 flex-wrap'>
			{summary.critical > 0 && (
				<span className='text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-semibold'>
					{summary.critical} critical
				</span>
			)}
			{summary.high > 0 && (
				<span className='text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-semibold'>
					{summary.high} high
				</span>
			)}
			{summary.medium > 0 && (
				<span className='text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded'>
					{summary.medium} med
				</span>
			)}
			{summary.low > 0 && (
				<span className='text-xs bg-info/10 text-info px-1.5 py-0.5 rounded'>
					{summary.low} low
				</span>
			)}
			{summary.info > 0 && (
				<span className='text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded'>
					{summary.info} info
				</span>
			)}
		</div>
	);
}

// Re-export the ScanSummary type to avoid re-importing locally

// ─── StatusDot ────────────────────────────────────────────────────────────────

export function StatusDot({ status }: { status: string }) {
	const classes: Record<string, string> = {
		completed: 'bg-success',
		failed: 'bg-destructive',
		running: 'bg-warning animate-pulse',
		pending: 'bg-muted-foreground',
		queued: 'bg-muted-foreground',
	};
	return (
		<span
			className={`inline-block w-2 h-2 rounded-full ${classes[status] ?? 'bg-muted-foreground'}`}
			aria-label={`Status: ${status}`}
		/>
	);
}

// ─── ClipboardListIcon ────────────────────────────────────────────────────────

export function ClipboardListIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			aria-hidden='true'
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

// ─── FindingItem ──────────────────────────────────────────────────────────────

export function FindingItem({
	finding,
	row,
	onAck,
	onUnAck,
	onFix,
	targetType,
}: {
	finding: SecurityFinding;
	row?: FindingRow;
	onAck?: (row: FindingRow) => void;
	onUnAck?: (row: FindingRow) => void;
	onFix?: (actionId: string) => void;
	targetType?: 'server' | 'environment';
}) {
	const [open, setOpen] = useState(false);
	const icons: Record<Severity, React.ReactNode> = {
		critical: (
			<ShieldX className='h-4 w-4 text-red-500 shrink-0' aria-hidden='true' />
		),
		high: (
			<AlertTriangle
				className='h-4 w-4 text-orange-500 shrink-0'
				aria-hidden='true'
			/>
		),
		medium: (
			<AlertTriangle
				className='h-4 w-4 text-yellow-500 shrink-0'
				aria-hidden='true'
			/>
		),
		low: <Info className='h-4 w-4 text-info shrink-0' aria-hidden='true' />,
		info: (
			<Info className='h-4 w-4 text-muted-foreground shrink-0' aria-hidden='true' />
		),
	};
	const hasMetadata =
		finding.metadata && Object.keys(finding.metadata).length > 0;

	return (
		<div className='border rounded-md overflow-hidden bg-card'>
			<button
				className='w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors'
				onClick={() => setOpen(v => !v)}
				aria-expanded={open}
			>
				{icons[finding.severity]}
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2 flex-wrap'>
						<SeverityBadge severity={finding.severity} />
						<span className='text-xs text-muted-foreground'>
							{finding.category.replace(/_/g, ' ')}
						</span>
						{row && (
							<span className='text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono'>
								{row.server_name
									? `${row.server_name} · ${formatScanType(row.scan_type)}`
									: row.project_name
										? `${row.project_name} / ${row.environment_type} · ${formatScanType(row.scan_type)}`
										: formatScanType(row.scan_type)}
							</span>
						)}
						{row?.ack && (
							<span className='inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium'>
								<CheckCircle2 className='h-3 w-3' aria-hidden='true' />
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
					<ChevronDown
						className='h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground'
						aria-hidden='true'
					/>
				) : (
					<ChevronRight
						className='h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground'
						aria-hidden='true'
					/>
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
						<div className='bg-muted/30 rounded-lg p-3 border border-muted-foreground/10'>
							<p className='text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-3'>
								Technical Details
							</p>
							<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
								{Object.entries(finding.metadata!).map(([k, v]) => (
									<div key={k} className='space-y-1'>
										<dt className='text-[10px] text-muted-foreground font-medium uppercase'>
											{k.replace(/_/g, ' ')}
										</dt>
										<dd className='font-mono text-xs text-foreground break-all bg-background/50 p-1.5 rounded border border-muted-foreground/5'>
											{Array.isArray(v)
												? v.join(', ')
												: typeof v === 'object' && v !== null
													? JSON.stringify(v)
													: String(v)}
										</dd>
									</div>
								))}
							</div>
						</div>
					)}
					{row && (
						<div className='flex justify-end gap-2 pt-1 flex-wrap'>
							{onFix &&
								(() => {
									const fixAction = getFixAction(
										finding.category,
										finding.title,
										targetType ?? (row.server_id ? 'server' : 'environment'),
									);
									return fixAction ? (
										<Button
											variant='outline'
											size='sm'
											className='h-6 px-2 text-xs border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400'
											onClick={e => {
												e.stopPropagation();
												onFix(fixAction);
											}}
											aria-label={`Auto-fix: ${finding.title}`}
										>
											<Wrench className='h-3 w-3 mr-1' aria-hidden='true' />
											Fix Now
										</Button>
									) : null;
								})()}
							{row.ack ? (
								<>
									<span className='text-xs text-muted-foreground flex items-center gap-1'>
										<CheckCircle2
											className='h-3 w-3 text-green-500'
											aria-hidden='true'
										/>
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
											aria-label='Remove acknowledgement'
										>
											<X className='h-3 w-3 mr-1' aria-hidden='true' />
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
									aria-label='Acknowledge this finding'
								>
									<CheckCircle2 className='h-3 w-3 mr-1' aria-hidden='true' />
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

// ─── AcknowledgeFindingDialog ─────────────────────────────────────────────────

export function AcknowledgeFindingDialog({
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
						<Label htmlFor='ack-note' className='text-xs'>
							Note{' '}
							<span className='text-muted-foreground font-normal'>
								(optional)
							</span>
						</Label>
						<Textarea
							id='ack-note'
							value={note}
							onChange={e => setNote(e.target.value)}
							placeholder='e.g. Accepted risk — scheduled for Q3 patching cycle'
							className='text-sm resize-none'
							rows={3}
							aria-describedby='ack-note-hint'
						/>
						<p id='ack-note-hint' className='sr-only'>
							Optional note explaining why the finding is being acknowledged
						</p>
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
