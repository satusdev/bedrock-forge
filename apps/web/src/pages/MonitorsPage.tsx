import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWebSocketEvent } from '@/lib/websocket';
import { WS_EVENTS } from '@bedrock-forge/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2, Pencil } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { PageHeader, DataTable, type Column } from '@/components/crud';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

interface Environment {
	id: number;
	type: string;
	url: string;
	project: { name: string };
}

interface Monitor {
	id: number;
	enabled: boolean;
	interval_seconds: number;
	last_checked_at: string | null;
	last_status: number | null;
	last_response_ms: number | null;
	uptime_pct: number | string | null;
	environment: { id: number; url: string; type: string };
}

const monitorSchema = z.object({
	environment_id: z.coerce
		.number({ invalid_type_error: 'Environment is required' })
		.positive('Environment is required'),
	interval_seconds: z.coerce.number().default(60),
});
type MonitorForm = z.infer<typeof monitorSchema>;

const INTERVALS = [
	{ value: '30', label: '30 seconds' },
	{ value: '60', label: '1 minute' },
	{ value: '300', label: '5 minutes' },
	{ value: '600', label: '10 minutes' },
	{ value: '1800', label: '30 minutes' },
];

function isUp(status: number | null): boolean {
	return status !== null && status >= 200 && status < 300;
}

function StatusDot({ status }: { status: number | null }) {
	if (status === null)
		return <span className='inline-block w-2 h-2 rounded-full bg-muted' />;
	return (
		<span
			className={`inline-block w-2 h-2 rounded-full ${
				isUp(status) ? 'bg-green-500' : 'bg-red-500'
			}`}
		/>
	);
}

function CreateMonitorDialog({
	open,
	onOpenChange,
	environments,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	environments: Environment[];
	onSuccess: () => void;
}) {
	const {
		handleSubmit,
		setValue,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<MonitorForm>({
		resolver: zodResolver(monitorSchema),
		defaultValues: { interval_seconds: 60 },
	});

	async function onSubmit(data: MonitorForm) {
		try {
			await api.post('/monitors', {
				environment_id: data.environment_id,
				interval_seconds: data.interval_seconds,
			});
			toast({ title: 'Monitor created' });
			reset();
			onSuccess();
			onOpenChange(false);
		} catch {
			toast({ title: 'Create failed', variant: 'destructive' });
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>New Monitor</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label>Environment *</Label>
						<Select onValueChange={v => setValue('environment_id', Number(v))}>
							<SelectTrigger>
								<SelectValue placeholder='Select environment…' />
							</SelectTrigger>
							<SelectContent>
								{environments.map(e => (
									<SelectItem key={e.id} value={e.id.toString()}>
										{e.project.name} — {e.url}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{errors.environment_id && (
							<p className='text-xs text-destructive'>
								{errors.environment_id.message}
							</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label>Check interval</Label>
						<Select
							defaultValue='60'
							onValueChange={v => setValue('interval_seconds', Number(v))}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{INTERVALS.map(i => (
									<SelectItem key={i.value} value={i.value}>
										{i.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isSubmitting ? 'Creating…' : 'Create'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function EditMonitorDialog({
	monitor,
	onOpenChange,
	onSave,
}: {
	monitor: Monitor | null;
	onOpenChange: (o: boolean) => void;
	onSave: (id: number, interval_seconds: number) => void;
}) {
	const [interval, setInterval] = useState(
		String(monitor?.interval_seconds ?? 60),
	);

	if (!monitor) return null;

	return (
		<Dialog open={!!monitor} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-sm'>
				<DialogHeader>
					<DialogTitle>Edit Monitor</DialogTitle>
				</DialogHeader>
				<div className='space-y-4'>
					<div className='space-y-1'>
						<Label>URL</Label>
						<p className='text-sm font-mono text-muted-foreground truncate'>
							{monitor.environment.url}
						</p>
					</div>
					<div className='space-y-1'>
						<Label>Check interval</Label>
						<Select value={interval} onValueChange={setInterval}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{INTERVALS.map(i => (
									<SelectItem key={i.value} value={i.value}>
										{i.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={() => onSave(monitor.id, Number(interval))}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function MonitorsPage() {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<Monitor | null>(null);
	const [editTarget, setEditTarget] = useState<Monitor | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ['monitors'],
		queryFn: () => api.get<Monitor[]>('/monitors'),
		// Monitors update on their own schedule — poll to reflect results
		refetchInterval: 30_000,
	});

	const { data: environments = [] } = useQuery({
		queryKey: ['environments-all'],
		queryFn: () => api.get<Environment[]>('/environments'),
	});

	// Invalidate immediately when the worker finishes a monitor check
	useWebSocketEvent(WS_EVENTS.MONITOR_RESULT, () => {
		qc.invalidateQueries({ queryKey: ['monitors'] });
	});

	const toggle = useMutation({
		mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
			enabled
				? api.put(`/monitors/${id}/deactivate`, {})
				: api.put(`/monitors/${id}/activate`, {}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['monitors'] }),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/monitors/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['monitors'] });
			setDeleteTarget(null);
			toast({ title: 'Monitor deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const editMutation = useMutation({
		mutationFn: ({
			id,
			interval_seconds,
		}: {
			id: number;
			interval_seconds: number;
		}) => api.put(`/monitors/${id}`, { interval_seconds }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['monitors'] });
			setEditTarget(null);
			toast({ title: 'Monitor updated' });
		},
		onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
	});

	function invalidate() {
		qc.invalidateQueries({ queryKey: ['monitors'] });
	}

	const columns: Column<Monitor>[] = [
		{
			header: 'Status',
			render: m => (
				<button
					type='button'
					className='flex items-center gap-2 text-left w-full'
					onClick={() => navigate(`/monitors/${m.id}`)}
				>
					<StatusDot status={m.last_status} />
					<span
						className={`text-xs font-medium ${
							m.last_status === null
								? 'text-muted-foreground'
								: isUp(m.last_status)
									? 'text-green-600 dark:text-green-400'
									: 'text-red-600 dark:text-red-400'
						}`}
					>
						{m.last_status ?? 'pending'}
					</span>
				</button>
			),
		},
		{
			header: 'URL',
			render: m => (
				<button
					type='button'
					className='font-mono text-xs text-primary underline truncate max-w-[200px] block text-left'
					onClick={() => navigate(`/monitors/${m.id}`)}
				>
					{m.environment.url}
				</button>
			),
		},
		{
			header: 'Type',
			render: m => (
				<span className='capitalize'>{m.environment.type.toLowerCase()}</span>
			),
		},
		{
			header: 'Interval',
			render: m => <span>{m.interval_seconds}s</span>,
		},
		{
			header: 'Uptime',
			render: m => {
				const pct = parseFloat(String(m.uptime_pct ?? 0));
				return (
					<span
						className={`font-mono ${
							pct >= 99
								? 'text-green-600 dark:text-green-400'
								: pct >= 95
									? 'text-yellow-600 dark:text-yellow-400'
									: 'text-red-600 dark:text-red-400'
						}`}
					>
						{pct.toFixed(2)}%
					</span>
				);
			},
		},
		{
			header: 'Last Check',
			render: m => (
				<span className='text-muted-foreground text-xs'>
					{m.last_checked_at
						? new Date(m.last_checked_at).toLocaleString()
						: '—'}
				</span>
			),
		},
		{
			header: 'Active',
			render: m => (
				<button
					onClick={() => toggle.mutate({ id: m.id, enabled: m.enabled })}
					disabled={toggle.isPending}
					className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
						m.enabled ? 'bg-primary' : 'bg-muted'
					}`}
				>
					<span
						className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
							m.enabled ? 'translate-x-4' : 'translate-x-1'
						}`}
					/>
				</button>
			),
		},
	];

	return (
		<div className='space-y-4'>
			<PageHeader
				title='Monitors'
				onCreate={() => setCreateOpen(true)}
				createLabel='New Monitor'
			/>

			<DataTable
				columns={columns}
				data={data ?? []}
				isLoading={isLoading}
				rowKey={m => m.id}
				emptyMessage='No monitors yet.'
				renderActions={m => (
					<div className='flex items-center gap-1'>
						<Button
							variant='ghost'
							size='icon'
							className='h-7 w-7 text-muted-foreground hover:text-foreground'
							onClick={() => setEditTarget(m)}
							title='Edit monitor'
						>
							<Pencil className='h-4 w-4' />
						</Button>
						<Button
							variant='ghost'
							size='icon'
							className='h-7 w-7 text-destructive hover:text-destructive'
							onClick={() => setDeleteTarget(m)}
						>
							<Trash2 className='h-4 w-4' />
						</Button>
					</div>
				)}
			/>

			<CreateMonitorDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				environments={environments}
				onSuccess={invalidate}
			/>

			<EditMonitorDialog
				monitor={editTarget}
				onOpenChange={o => !o && setEditTarget(null)}
				onSave={(id, interval_seconds) =>
					editMutation.mutate({ id, interval_seconds })
				}
			/>

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Monitor'
				description={`The monitor for "${deleteTarget?.environment.url}" will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
