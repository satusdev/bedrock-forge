import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	MoreHorizontal,
	Pencil,
	Trash2,
	Bell,
	BellOff,
	FlaskConical,
	CheckCircle2,
	XCircle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

import { Separator } from '@/components/ui/separator';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
	PageHeader,
	DataTable,
	Pagination,
	type Column,
} from '@/components/crud';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Event catalogue ───────────────────────────────────────────────────────────

const EVENT_GROUPS: Record<string, string[]> = {
	Jobs: [
		'backup.completed',
		'backup.failed',
		'plugin-scan.completed',
		'sync.completed',
		'sync.failed',
		'plugin-update.completed',
		'plugin-update.failed',
	],
	Monitoring: [
		'monitor.down',
		'monitor.up',
		'monitor.ssl_expiry',
		'monitor.dns_failed',
		'monitor.keyword_missing',
	],
	Billing: ['invoice.created', 'invoice.overdue'],
	Users: ['user.registered', 'user.login'],
	Servers: ['server.created', 'server.deleted'],
	Reports: ['report.weekly'],
};

const ALL_EVENTS = Object.values(EVENT_GROUPS).flat();

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotificationChannel {
	id: number;
	name: string;
	type: string;
	slack_channel_id: string | null;
	has_token: boolean;
	events: string[];
	active: boolean;
	created_at: string;
}

interface NotificationLog {
	id: number;
	event_type: string;
	status: 'sent' | 'failed';
	error: string | null;
	created_at: string;
	channel: { name: string } | null;
}

// ── Channel Form ──────────────────────────────────────────────────────────────

const channelSchema = z.object({
	name: z.string().min(1, 'Required').max(100),
	slack_bot_token: z.string().optional().or(z.literal('')),
	slack_channel_id: z.string().max(100).optional().or(z.literal('')),
	events: z.array(z.string()).min(1, 'Pick at least one event'),
	active: z.boolean().default(true),
});
type ChannelForm = z.infer<typeof channelSchema>;

function ChannelFormDialog({
	open,
	onOpenChange,
	initial,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial?: NotificationChannel;
	onSuccess: () => void;
}) {
	const {
		register,
		handleSubmit,
		watch,
		setValue,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<ChannelForm>({
		resolver: zodResolver(channelSchema),
		defaultValues: {
			name: initial?.name ?? '',
			slack_bot_token: '',
			slack_channel_id: initial?.slack_channel_id ?? '',
			events: initial?.events ?? [],
			active: initial?.active ?? true,
		},
	});

	const selectedEvents = watch('events');

	function toggleEvent(ev: string) {
		const cur = selectedEvents ?? [];
		setValue(
			'events',
			cur.includes(ev) ? cur.filter(e => e !== ev) : [...cur, ev],
			{ shouldValidate: true },
		);
	}

	function toggleGroup(groupEvents: string[]) {
		const cur = selectedEvents ?? [];
		const allSelected = groupEvents.every(e => cur.includes(e));
		if (allSelected) {
			setValue(
				'events',
				cur.filter(e => !groupEvents.includes(e)),
				{ shouldValidate: true },
			);
		} else {
			const merged = Array.from(new Set([...cur, ...groupEvents]));
			setValue('events', merged, { shouldValidate: true });
		}
	}

	function selectAll() {
		setValue('events', ALL_EVENTS, { shouldValidate: true });
	}

	async function onSubmit(data: ChannelForm) {
		try {
			const payload: Record<string, unknown> = {
				name: data.name,
				type: 'slack',
				slack_channel_id: data.slack_channel_id || undefined,
				events: data.events,
				active: data.active,
			};
			if (data.slack_bot_token)
				payload['slack_bot_token'] = data.slack_bot_token;

			if (initial) {
				await api.put(`/notifications/channels/${initial.id}`, payload);
				toast({ title: 'Channel updated' });
			} else {
				await api.post('/notifications/channels', payload);
				toast({ title: 'Channel created' });
			}
			reset();
			onSuccess();
			onOpenChange(false);
		} catch {
			toast({ title: 'Save failed', variant: 'destructive' });
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-lg max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>
						{initial ? 'Edit Channel' : 'New Slack Channel'}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label htmlFor='nc-name'>Channel Name *</Label>
						<Input
							id='nc-name'
							{...register('name')}
							placeholder='Production Alerts'
						/>
						{errors.name && (
							<p className='text-xs text-destructive'>{errors.name.message}</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='nc-token'>
							Bot Token{' '}
							{initial?.has_token ? '(leave blank to keep existing)' : '*'}
						</Label>
						<Input
							id='nc-token'
							type='password'
							{...register('slack_bot_token')}
							placeholder='xoxb-••••••••••••••••••••••••'
							autoComplete='off'
						/>
					</div>

					<div className='space-y-1'>
						<Label htmlFor='nc-channel'>Slack Channel ID</Label>
						<Input
							id='nc-channel'
							{...register('slack_channel_id')}
							placeholder='C0XXXXXXXXX'
						/>
					</div>

					<div className='space-y-2'>
						<div className='flex items-center justify-between'>
							<Label>Events *</Label>
							<button
								type='button'
								onClick={selectAll}
								className='text-xs text-muted-foreground hover:text-foreground underline'
							>
								Select all
							</button>
						</div>

						{Object.entries(EVENT_GROUPS).map(([group, events]) => {
							const allSelected = events.every(e =>
								selectedEvents?.includes(e),
							);
							return (
								<div key={group} className='space-y-1.5'>
									<label className='flex items-center gap-2 text-sm font-medium cursor-pointer'>
										<input
											type='checkbox'
											className='h-4 w-4 rounded accent-primary cursor-pointer'
											checked={allSelected}
											onChange={() => toggleGroup(events)}
										/>
										{group}
									</label>
									<div className='pl-5 grid grid-cols-2 gap-1'>
										{events.map(ev => (
											<label
												key={ev}
												className='flex items-center gap-2 text-xs text-muted-foreground cursor-pointer'
											>
												<input
													type='checkbox'
													className='h-3.5 w-3.5 rounded accent-primary cursor-pointer'
													checked={selectedEvents?.includes(ev) ?? false}
													onChange={() => toggleEvent(ev)}
												/>
												{ev}
											</label>
										))}
									</div>
								</div>
							);
						})}
						{errors.events && (
							<p className='text-xs text-destructive'>
								{errors.events.message}
							</p>
						)}
					</div>

					<div className='flex items-center gap-3'>
						<Switch
							id='nc-active'
							checked={watch('active')}
							onCheckedChange={v => setValue('active', v)}
						/>
						<Label htmlFor='nc-active'>Active</Label>
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
							{isSubmitting ? 'Saving…' : initial ? 'Update' : 'Create'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function NotificationsPage() {
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<NotificationChannel | null>(
		null,
	);
	const [deleteTarget, setDeleteTarget] = useState<NotificationChannel | null>(
		null,
	);
	const [testingId, setTestingId] = useState<number | null>(null);
	const [logPage, setLogPage] = useState(1);
	const LOG_PAGE_SIZE = 15;

	const { data: channels = [], isLoading } = useQuery({
		queryKey: ['notification-channels'],
		queryFn: () => api.get<NotificationChannel[]>('/notifications/channels'),
	});

	const { data: logs = [] } = useQuery({
		queryKey: ['notification-logs'],
		queryFn: () => api.get<NotificationLog[]>('/notifications/logs'),
		refetchInterval: 30_000,
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/notifications/channels/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['notification-channels'] });
			setDeleteTarget(null);
			toast({ title: 'Channel deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	async function testChannel(id: number) {
		setTestingId(id);
		try {
			const { ok, message } = await api.post<{ ok: boolean; message?: string }>(
				`/notifications/channels/${id}/test`,
				{},
			);
			if (ok) {
				toast({ title: 'Test message sent ✓' });
			} else {
				toast({ title: `Test failed: ${message}`, variant: 'destructive' });
			}
		} catch {
			toast({ title: 'Test failed', variant: 'destructive' });
		} finally {
			setTestingId(null);
		}
	}

	function invalidate() {
		qc.invalidateQueries({ queryKey: ['notification-channels'] });
	}

	const columns: Column<NotificationChannel>[] = [
		{
			header: 'Name',
			render: c => (
				<div className='flex items-center gap-2'>
					{c.active ? (
						<Bell className='h-4 w-4 text-primary' />
					) : (
						<BellOff className='h-4 w-4 text-muted-foreground' />
					)}
					<span className='font-medium'>{c.name}</span>
				</div>
			),
		},
		{
			header: 'Type',
			render: c => (
				<Badge variant='secondary' className='capitalize'>
					{c.type}
				</Badge>
			),
		},
		{
			header: 'Channel ID',
			render: c => (
				<span className='font-mono text-xs text-muted-foreground'>
					{c.slack_channel_id ?? '—'}
				</span>
			),
		},
		{
			header: 'Token',
			render: c =>
				c.has_token ? (
					<CheckCircle2 className='h-4 w-4 text-green-500' />
				) : (
					<XCircle className='h-4 w-4 text-muted-foreground' />
				),
		},
		{
			header: 'Events',
			render: c => (
				<span className='text-sm text-muted-foreground'>
					{c.events.length} event{c.events.length !== 1 ? 's' : ''}
				</span>
			),
		},
		{
			header: 'Status',
			render: c =>
				c.active ? (
					<Badge variant='default'>Active</Badge>
				) : (
					<Badge variant='outline'>Inactive</Badge>
				),
		},
	];

	return (
		<div className='space-y-6'>
			<PageHeader
				title='Notifications'
				onCreate={() => setCreateOpen(true)}
				createLabel='New Channel'
			/>

			<DataTable
				columns={columns}
				data={channels}
				isLoading={isLoading}
				rowKey={c => c.id}
				emptyMessage='No channels configured yet.'
				renderActions={channel => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon' className='h-7 w-7'>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuItem
								onClick={() => testChannel(channel.id)}
								disabled={testingId === channel.id}
							>
								<FlaskConical className='h-4 w-4 mr-2' />
								{testingId === channel.id ? 'Testing…' : 'Test'}
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setEditTarget(channel)}>
								<Pencil className='h-4 w-4 mr-2' />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								className='text-destructive focus:text-destructive'
								onClick={() => setDeleteTarget(channel)}
							>
								<Trash2 className='h-4 w-4 mr-2' />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			{/* Recent Logs */}
			{logs.length > 0 && (
				<div>
					<Separator className='mb-4' />
					<h2 className='text-base font-semibold mb-3'>Recent Dispatch Logs</h2>
					<div className='rounded-md border overflow-hidden'>
						<table className='w-full text-sm'>
							<thead>
								<tr className='bg-muted/40 border-b'>
									<th className='px-4 py-2 text-left font-medium'>Channel</th>
									<th className='px-4 py-2 text-left font-medium'>Event</th>
									<th className='px-4 py-2 text-left font-medium'>Status</th>
									<th className='px-4 py-2 text-left font-medium'>Error</th>
									<th className='px-4 py-2 text-left font-medium'>Time</th>
								</tr>
							</thead>
							<tbody>
								{logs
									.slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE)
									.map(log => (
										<tr
											key={log.id}
											className='border-b last:border-0 hover:bg-muted/20'
										>
											<td className='px-4 py-2 text-muted-foreground'>
												{log.channel?.name ?? '—'}
											</td>
											<td className='px-4 py-2 font-mono text-xs'>
												{log.event_type}
											</td>
											<td className='px-4 py-2'>
												{log.status === 'sent' ? (
													<CheckCircle2 className='h-4 w-4 text-green-500' />
												) : (
													<XCircle className='h-4 w-4 text-destructive' />
												)}
											</td>
											<td className='px-4 py-2 text-xs text-muted-foreground truncate max-w-xs'>
												{log.error ?? '—'}
											</td>
											<td className='px-4 py-2 text-muted-foreground text-xs'>
												{new Date(log.created_at).toLocaleString()}
											</td>
										</tr>
									))}
							</tbody>
						</table>
					</div>
					<div className='mt-3'>
						<Pagination
							page={logPage}
							totalPages={Math.ceil(logs.length / LOG_PAGE_SIZE)}
							onPageChange={setLogPage}
						/>
					</div>
				</div>
			)}

			<ChannelFormDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSuccess={invalidate}
			/>

			{editTarget && (
				<ChannelFormDialog
					key={editTarget.id}
					open
					onOpenChange={o => !o && setEditTarget(null)}
					initial={editTarget}
					onSuccess={invalidate}
				/>
			)}

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Channel'
				description={`"${deleteTarget?.name}" will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
