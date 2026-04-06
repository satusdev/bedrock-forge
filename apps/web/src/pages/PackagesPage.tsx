import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Pencil,
	Trash2,
	MoreHorizontal,
	CheckCircle2,
	XCircle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, DataTable, type Column } from '@/components/crud';
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

// ── Hosting ──────────────────────────────────────────────────────────────────

interface HostingPackage {
	id: number;
	name: string;
	price_monthly: string;
	storage_gb: number | null;
	bandwidth_gb: number | null;
	max_sites: number | null;
	is_active: boolean;
}

interface SupportPackage {
	id: number;
	name: string;
	price_monthly: string;
	response_hours: number | null;
	includes_updates: boolean;
	is_active: boolean;
}

const hostingSchema = z.object({
	name: z.string().min(1, 'Required').max(100),
	price_monthly: z.coerce.number().min(0, 'Must be ≥ 0'),
	storage_gb: z.coerce.number().int().positive().optional().nullable(),
	bandwidth_gb: z.coerce.number().int().positive().optional().nullable(),
	max_sites: z.coerce.number().int().positive().optional().nullable(),
	is_active: z.boolean().default(true),
});
type HostingForm = z.infer<typeof hostingSchema>;

const supportSchema = z.object({
	name: z.string().min(1, 'Required').max(100),
	price_monthly: z.coerce.number().min(0, 'Must be ≥ 0'),
	response_hours: z.coerce.number().int().positive().optional().nullable(),
	includes_updates: z.boolean().default(false),
	is_active: z.boolean().default(true),
});
type SupportForm = z.infer<typeof supportSchema>;

// ── Hosting Form Dialog ───────────────────────────────────────────────────────

function HostingFormDialog({
	open,
	onOpenChange,
	initial,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial?: HostingPackage;
	onSuccess: () => void;
}) {
	const {
		register,
		handleSubmit,
		watch,
		setValue,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<HostingForm>({
		resolver: zodResolver(hostingSchema),
		defaultValues: {
			name: initial?.name ?? '',
			price_monthly: initial ? parseFloat(initial.price_monthly) : 0,
			storage_gb: initial?.storage_gb ?? undefined,
			bandwidth_gb: initial?.bandwidth_gb ?? undefined,
			max_sites: initial?.max_sites ?? undefined,
			is_active: initial?.is_active ?? true,
		},
	});

	async function onSubmit(data: HostingForm) {
		try {
			if (initial) {
				await api.put(`/packages/hosting/${initial.id}`, data);
				toast({ title: 'Hosting package updated' });
			} else {
				await api.post('/packages/hosting', data);
				toast({ title: 'Hosting package created' });
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
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>
						{initial ? 'Edit Hosting Package' : 'New Hosting Package'}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label htmlFor='hp-name'>Name *</Label>
						<Input
							id='hp-name'
							{...register('name')}
							placeholder='Basic Hosting'
						/>
						{errors.name && (
							<p className='text-xs text-destructive'>{errors.name.message}</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='hp-price'>Monthly Price ($) *</Label>
						<Input
							id='hp-price'
							type='number'
							step='0.01'
							{...register('price_monthly')}
						/>
						{errors.price_monthly && (
							<p className='text-xs text-destructive'>
								{errors.price_monthly.message}
							</p>
						)}
					</div>

					<div className='grid grid-cols-3 gap-3'>
						<div className='space-y-1'>
							<Label htmlFor='hp-storage'>Storage (GB)</Label>
							<Input
								id='hp-storage'
								type='number'
								{...register('storage_gb')}
								placeholder='10'
							/>
						</div>
						<div className='space-y-1'>
							<Label htmlFor='hp-bandwidth'>Bandwidth (GB)</Label>
							<Input
								id='hp-bandwidth'
								type='number'
								{...register('bandwidth_gb')}
								placeholder='100'
							/>
						</div>
						<div className='space-y-1'>
							<Label htmlFor='hp-sites'>Max Sites</Label>
							<Input
								id='hp-sites'
								type='number'
								{...register('max_sites')}
								placeholder='5'
							/>
						</div>
					</div>

					<div className='flex items-center gap-3'>
						<Switch
							id='hp-active'
							checked={watch('is_active')}
							onCheckedChange={v => setValue('is_active', v)}
						/>
						<Label htmlFor='hp-active'>Active</Label>
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

// ── Support Form Dialog ───────────────────────────────────────────────────────

function SupportFormDialog({
	open,
	onOpenChange,
	initial,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial?: SupportPackage;
	onSuccess: () => void;
}) {
	const {
		register,
		handleSubmit,
		watch,
		setValue,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<SupportForm>({
		resolver: zodResolver(supportSchema),
		defaultValues: {
			name: initial?.name ?? '',
			price_monthly: initial ? parseFloat(initial.price_monthly) : 0,
			response_hours: initial?.response_hours ?? undefined,
			includes_updates: initial?.includes_updates ?? false,
			is_active: initial?.is_active ?? true,
		},
	});

	async function onSubmit(data: SupportForm) {
		try {
			if (initial) {
				await api.put(`/packages/support/${initial.id}`, data);
				toast({ title: 'Support package updated' });
			} else {
				await api.post('/packages/support', data);
				toast({ title: 'Support package created' });
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
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>
						{initial ? 'Edit Support Package' : 'New Support Package'}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label htmlFor='sp-name'>Name *</Label>
						<Input
							id='sp-name'
							{...register('name')}
							placeholder='Standard Support'
						/>
						{errors.name && (
							<p className='text-xs text-destructive'>{errors.name.message}</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='sp-price'>Monthly Price ($) *</Label>
						<Input
							id='sp-price'
							type='number'
							step='0.01'
							{...register('price_monthly')}
						/>
						{errors.price_monthly && (
							<p className='text-xs text-destructive'>
								{errors.price_monthly.message}
							</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='sp-response'>Response Hours (SLA)</Label>
						<Input
							id='sp-response'
							type='number'
							{...register('response_hours')}
							placeholder='24'
						/>
					</div>

					<div className='flex items-center gap-3'>
						<Switch
							id='sp-updates'
							checked={watch('includes_updates')}
							onCheckedChange={v => setValue('includes_updates', v)}
						/>
						<Label htmlFor='sp-updates'>Includes Updates</Label>
					</div>

					<div className='flex items-center gap-3'>
						<Switch
							id='sp-active'
							checked={watch('is_active')}
							onCheckedChange={v => setValue('is_active', v)}
						/>
						<Label htmlFor='sp-active'>Active</Label>
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

// ── Hosting Tab ───────────────────────────────────────────────────────────────

function HostingTab() {
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<HostingPackage | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<HostingPackage | null>(null);

	const { data = [], isLoading } = useQuery({
		queryKey: ['hosting-packages'],
		queryFn: () => api.get<HostingPackage[]>('/packages/hosting'),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/packages/hosting/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['hosting-packages'] });
			setDeleteTarget(null);
			toast({ title: 'Package deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const columns: Column<HostingPackage>[] = [
		{
			header: 'Name',
			render: p => <span className='font-medium'>{p.name}</span>,
		},
		{
			header: 'Price/mo',
			render: p => <span>${parseFloat(p.price_monthly).toFixed(2)}</span>,
		},
		{
			header: 'Storage',
			render: p => (
				<span className='text-muted-foreground'>
					{p.storage_gb ? `${p.storage_gb} GB` : '—'}
				</span>
			),
		},
		{
			header: 'Bandwidth',
			render: p => (
				<span className='text-muted-foreground'>
					{p.bandwidth_gb ? `${p.bandwidth_gb} GB` : '—'}
				</span>
			),
		},
		{
			header: 'Max Sites',
			render: p => (
				<span className='text-muted-foreground'>{p.max_sites ?? '—'}</span>
			),
		},
		{
			header: 'Active',
			render: p =>
				p.is_active ? (
					<CheckCircle2 className='h-4 w-4 text-green-500' />
				) : (
					<XCircle className='h-4 w-4 text-muted-foreground' />
				),
		},
	];

	function invalidate() {
		qc.invalidateQueries({ queryKey: ['hosting-packages'] });
	}

	return (
		<div className='space-y-4'>
			<div className='flex justify-end'>
				<Button onClick={() => setCreateOpen(true)}>New Hosting Package</Button>
			</div>

			<DataTable
				columns={columns}
				data={data}
				isLoading={isLoading}
				rowKey={p => p.id}
				emptyMessage='No hosting packages yet.'
				renderActions={pkg => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon' className='h-7 w-7'>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuItem onClick={() => setEditTarget(pkg)}>
								<Pencil className='h-4 w-4 mr-2' /> Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								className='text-destructive focus:text-destructive'
								onClick={() => setDeleteTarget(pkg)}
							>
								<Trash2 className='h-4 w-4 mr-2' /> Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			<HostingFormDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSuccess={invalidate}
			/>
			{editTarget && (
				<HostingFormDialog
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
				title='Delete Hosting Package'
				description={`"${deleteTarget?.name}" will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}

// ── Support Tab ───────────────────────────────────────────────────────────────

function SupportTab() {
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<SupportPackage | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<SupportPackage | null>(null);

	const { data = [], isLoading } = useQuery({
		queryKey: ['support-packages'],
		queryFn: () => api.get<SupportPackage[]>('/packages/support'),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/packages/support/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['support-packages'] });
			setDeleteTarget(null);
			toast({ title: 'Package deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const columns: Column<SupportPackage>[] = [
		{
			header: 'Name',
			render: p => <span className='font-medium'>{p.name}</span>,
		},
		{
			header: 'Price/mo',
			render: p => <span>${parseFloat(p.price_monthly).toFixed(2)}</span>,
		},
		{
			header: 'Response SLA',
			render: p => (
				<span className='text-muted-foreground'>
					{p.response_hours ? `${p.response_hours}h` : '—'}
				</span>
			),
		},
		{
			header: 'Updates',
			render: p =>
				p.includes_updates ? (
					<CheckCircle2 className='h-4 w-4 text-green-500' />
				) : (
					<XCircle className='h-4 w-4 text-muted-foreground' />
				),
		},
		{
			header: 'Active',
			render: p =>
				p.is_active ? (
					<CheckCircle2 className='h-4 w-4 text-green-500' />
				) : (
					<XCircle className='h-4 w-4 text-muted-foreground' />
				),
		},
	];

	function invalidate() {
		qc.invalidateQueries({ queryKey: ['support-packages'] });
	}

	return (
		<div className='space-y-4'>
			<div className='flex justify-end'>
				<Button onClick={() => setCreateOpen(true)}>New Support Package</Button>
			</div>

			<DataTable
				columns={columns}
				data={data}
				isLoading={isLoading}
				rowKey={p => p.id}
				emptyMessage='No support packages yet.'
				renderActions={pkg => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon' className='h-7 w-7'>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuItem onClick={() => setEditTarget(pkg)}>
								<Pencil className='h-4 w-4 mr-2' /> Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								className='text-destructive focus:text-destructive'
								onClick={() => setDeleteTarget(pkg)}
							>
								<Trash2 className='h-4 w-4 mr-2' /> Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			<SupportFormDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSuccess={invalidate}
			/>
			{editTarget && (
				<SupportFormDialog
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
				title='Delete Support Package'
				description={`"${deleteTarget?.name}" will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PackagesPage() {
	return (
		<div className='space-y-4'>
			<PageHeader title='Packages' />

			<Tabs defaultValue='hosting'>
				<TabsList>
					<TabsTrigger value='hosting'>Hosting</TabsTrigger>
					<TabsTrigger value='support'>Support</TabsTrigger>
				</TabsList>
				<TabsContent value='hosting' className='pt-2'>
					<HostingTab />
				</TabsContent>
				<TabsContent value='support' className='pt-2'>
					<SupportTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
