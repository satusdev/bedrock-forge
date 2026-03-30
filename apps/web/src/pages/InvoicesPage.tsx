import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	FileText,
	MoreHorizontal,
	CheckCircle2,
	RefreshCw,
	Trash2,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	PageHeader,
	DataTable,
	type Column,
	Pagination,
} from '@/components/crud';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

const STATUS_VARIANT: Record<
	InvoiceStatus,
	'default' | 'secondary' | 'destructive' | 'outline'
> = {
	draft: 'outline',
	sent: 'secondary',
	paid: 'default',
	overdue: 'destructive',
	cancelled: 'outline',
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
	draft: 'Draft',
	sent: 'Sent',
	paid: 'Paid',
	overdue: 'Overdue',
	cancelled: 'Cancelled',
};

interface Invoice {
	id: number;
	invoice_number: string;
	status: InvoiceStatus;
	total_amount: string;
	hosting_amount: string;
	support_amount: string;
	period_start: string;
	period_end: string;
	due_date: string;
	paid_at: string | null;
	project: { id: number; name: string } | null;
	client: { id: number; name: string } | null;
}

interface PaginatedInvoices {
	items: Invoice[];
	total: number;
}

const THIS_YEAR = new Date().getFullYear();

const generateSchema = z.object({
	year: z.coerce.number().int().min(2020).max(2100),
	projectId: z.coerce.number().int().positive().optional(),
	bulk: z.boolean().default(false),
});
type GenerateForm = z.infer<typeof generateSchema>;

function GenerateDialog({
	open,
	onOpenChange,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	onSuccess: () => void;
}) {
	const {
		register,
		handleSubmit,
		watch,
		setValue,
		reset,
		formState: { isSubmitting },
	} = useForm<GenerateForm>({
		resolver: zodResolver(generateSchema),
		defaultValues: { year: THIS_YEAR, bulk: true },
	});

	const bulk = watch('bulk');

	async function onSubmit(data: GenerateForm) {
		try {
			if (data.bulk) {
				const { count } = await api.post<{ count: number }>(
					'/invoices/generate-bulk',
					{ year: data.year },
				);
				toast({ title: `Generated ${count} invoice(s) for ${data.year}` });
			} else {
				if (!data.projectId) {
					toast({ title: 'Project ID is required', variant: 'destructive' });
					return;
				}
				await api.post('/invoices/generate', {
					projectId: data.projectId,
					year: data.year,
				});
				toast({ title: `Invoice generated` });
			}
			reset();
			onSuccess();
			onOpenChange(false);
		} catch {
			toast({ title: 'Generation failed', variant: 'destructive' });
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-sm'>
				<DialogHeader>
					<DialogTitle>Generate Invoices</DialogTitle>
					<DialogDescription>
						Yearly invoices are calculated as monthly price × 12.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label htmlFor='gen-year'>Year</Label>
						<Input id='gen-year' type='number' {...register('year')} />
					</div>

					<div className='flex gap-3'>
						<button
							type='button'
							onClick={() => setValue('bulk', true)}
							className={`flex-1 border rounded-md px-3 py-2 text-sm font-medium transition-colors ${bulk ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
						>
							All Projects
						</button>
						<button
							type='button'
							onClick={() => setValue('bulk', false)}
							className={`flex-1 border rounded-md px-3 py-2 text-sm font-medium transition-colors ${!bulk ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'}`}
						>
							Single Project
						</button>
					</div>

					{!bulk && (
						<div className='space-y-1'>
							<Label htmlFor='gen-project'>Project ID</Label>
							<Input
								id='gen-project'
								type='number'
								{...register('projectId')}
								placeholder='123'
							/>
						</div>
					)}

					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isSubmitting ? 'Generating…' : 'Generate'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function InvoicesPage() {
	const qc = useQueryClient();
	const [page, setPage] = useState(1);
	const [statusFilter, setStatusFilter] = useState<string>('');
	const [yearFilter, setYearFilter] = useState<string>('');
	const [generateOpen, setGenerateOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);

	const params = new URLSearchParams({ page: String(page), limit: '20' });
	if (statusFilter) params.set('status', statusFilter);
	if (yearFilter) params.set('year', yearFilter);

	const { data, isLoading } = useQuery({
		queryKey: ['invoices', page, statusFilter, yearFilter],
		queryFn: () => api.get<PaginatedInvoices>(`/invoices?${params}`),
	});

	const markPaidMutation = useMutation({
		mutationFn: (id: number) => api.put(`/invoices/${id}/mark-paid`, {}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['invoices'] });
			toast({ title: 'Invoice marked as paid' });
		},
		onError: () => toast({ title: 'Failed to update', variant: 'destructive' }),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/invoices/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['invoices'] });
			setDeleteTarget(null);
			toast({ title: 'Invoice deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const totalPages = data ? Math.ceil(data.total / 20) : 1;

	const columns: Column<Invoice>[] = [
		{
			header: 'Invoice #',
			render: inv => (
				<div className='flex items-center gap-2'>
					<FileText className='h-4 w-4 text-muted-foreground' />
					<span className='font-mono font-medium text-sm'>
						{inv.invoice_number}
					</span>
				</div>
			),
		},
		{
			header: 'Client',
			render: inv => (
				<span className='text-muted-foreground'>{inv.client?.name ?? '—'}</span>
			),
		},
		{
			header: 'Project',
			render: inv => <span>{inv.project?.name ?? '—'}</span>,
		},
		{
			header: 'Period',
			render: inv => (
				<span className='text-muted-foreground text-sm'>
					{new Date(inv.period_start).getFullYear()}
				</span>
			),
		},
		{
			header: 'Hosting',
			render: inv => <span>${parseFloat(inv.hosting_amount).toFixed(2)}</span>,
		},
		{
			header: 'Support',
			render: inv => <span>${parseFloat(inv.support_amount).toFixed(2)}</span>,
		},
		{
			header: 'Total',
			render: inv => (
				<span className='font-semibold'>
					${parseFloat(inv.total_amount).toFixed(2)}
				</span>
			),
		},
		{
			header: 'Status',
			render: inv => (
				<Badge variant={STATUS_VARIANT[inv.status]}>
					{STATUS_LABEL[inv.status]}
				</Badge>
			),
		},
		{
			header: 'Due',
			render: inv => (
				<span className='text-muted-foreground text-sm'>
					{new Date(inv.due_date).toLocaleDateString()}
				</span>
			),
		},
		{
			header: 'Paid',
			render: inv => (
				<span className='text-muted-foreground text-sm'>
					{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : '—'}
				</span>
			),
		},
	];

	return (
		<div className='space-y-4'>
			<PageHeader title='Invoices'>
				<Button
					variant='outline'
					size='sm'
					onClick={() => setGenerateOpen(true)}
				>
					<RefreshCw className='h-4 w-4 mr-1.5' />
					Generate Invoices
				</Button>
			</PageHeader>

			{/* Filters */}
			<div className='flex gap-3 flex-wrap'>
				<Select
					value={statusFilter || 'all'}
					onValueChange={v => {
						setStatusFilter(v === 'all' ? '' : v);
						setPage(1);
					}}
				>
					<SelectTrigger className='w-36'>
						<SelectValue placeholder='Status' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>All Statuses</SelectItem>
						<SelectItem value='draft'>Draft</SelectItem>
						<SelectItem value='sent'>Sent</SelectItem>
						<SelectItem value='paid'>Paid</SelectItem>
						<SelectItem value='overdue'>Overdue</SelectItem>
						<SelectItem value='cancelled'>Cancelled</SelectItem>
					</SelectContent>
				</Select>

				<Select
					value={yearFilter || 'all'}
					onValueChange={v => {
						setYearFilter(v === 'all' ? '' : v);
						setPage(1);
					}}
				>
					<SelectTrigger className='w-28'>
						<SelectValue placeholder='Year' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>All Years</SelectItem>
						{Array.from({ length: 6 }, (_, i) => THIS_YEAR - i).map(y => (
							<SelectItem key={y} value={String(y)}>
								{y}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{(statusFilter || yearFilter) && (
					<Button
						variant='ghost'
						size='sm'
						onClick={() => {
							setStatusFilter('');
							setYearFilter('');
							setPage(1);
						}}
					>
						Clear filters
					</Button>
				)}

				<span className='text-sm text-muted-foreground flex items-center ml-auto'>
					{data?.total ?? 0} invoices
				</span>
			</div>

			<DataTable
				columns={columns}
				data={data?.items ?? []}
				isLoading={isLoading}
				rowKey={inv => inv.id}
				emptyMessage='No invoices found.'
				renderActions={inv => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon' className='h-7 w-7'>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							{inv.status !== 'paid' && inv.status !== 'cancelled' && (
								<DropdownMenuItem
									onClick={() => markPaidMutation.mutate(inv.id)}
								>
									<CheckCircle2 className='h-4 w-4 mr-2' />
									Mark as Paid
								</DropdownMenuItem>
							)}
							{inv.status === 'draft' && (
								<DropdownMenuItem
									className='text-destructive focus:text-destructive'
									onClick={() => setDeleteTarget(inv)}
								>
									<Trash2 className='h-4 w-4 mr-2' />
									Delete
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			<Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

			<GenerateDialog
				open={generateOpen}
				onOpenChange={setGenerateOpen}
				onSuccess={() => qc.invalidateQueries({ queryKey: ['invoices'] })}
			/>

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Invoice'
				description={`Invoice "${deleteTarget?.invoice_number}" will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
