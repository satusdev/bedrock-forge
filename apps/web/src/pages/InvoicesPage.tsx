import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
FileText,
MoreHorizontal,
CheckCircle2,
RefreshCw,
Trash2,
ChevronDown,
ChevronRight,
Package,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
hosting_package: { id: number; name: string } | null;
support_package: { id: number; name: string } | null;
hosting_package_snapshot: string | null;
support_package_snapshot: string | null;
}

interface DialogClient {
id: number;
name: string;
}

interface DialogProject {
id: number;
name: string;
hosting_package: { name: string } | null;
support_package: { name: string } | null;
}

interface PaginatedInvoices {
items: Invoice[];
total: number;
}

const THIS_YEAR = new Date().getFullYear();

function fmt(amount: string) {
return `$${parseFloat(amount).toFixed(2)}`;
}

function fmtDate(iso: string) {
return new Date(iso).toLocaleDateString();
}

function InvoiceDetailPanel({ inv }: { inv: Invoice }) {
const hostingName =
inv.hosting_package?.name ?? inv.hosting_package_snapshot ?? null;
const supportName =
inv.support_package?.name ?? inv.support_package_snapshot ?? null;

const hostingMonthly =
parseFloat(inv.hosting_amount) > 0
? (parseFloat(inv.hosting_amount) / 12).toFixed(2)
: null;
const supportMonthly =
parseFloat(inv.support_amount) > 0
? (parseFloat(inv.support_amount) / 12).toFixed(2)
: null;

return (
<div className='bg-muted/30 border-t px-6 py-4'>
<div className='grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm'>
{/* Packages */}
<div className='space-y-2'>
<p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5'>
<Package className='h-3.5 w-3.5' />
Packages
</p>
{hostingName ? (
<div className='flex justify-between gap-2'>
<span className='text-muted-foreground'>Hosting</span>
<span className='font-medium truncate'>{hostingName}</span>
</div>
) : (
<p className='text-muted-foreground'>No hosting package</p>
)}
{supportName ? (
<div className='flex justify-between gap-2'>
<span className='text-muted-foreground'>Support</span>
<span className='font-medium truncate'>{supportName}</span>
</div>
) : (
<p className='text-muted-foreground'>No support package</p>
)}
</div>

{/* Breakdown */}
<div className='space-y-2'>
<p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide'>
Calculation
</p>
{hostingMonthly && (
<div className='flex justify-between gap-2'>
<span className='text-muted-foreground'>
${hostingMonthly}/mo × 12
</span>
<span>{fmt(inv.hosting_amount)}</span>
</div>
)}
{supportMonthly && (
<div className='flex justify-between gap-2'>
<span className='text-muted-foreground'>
${supportMonthly}/mo × 12
</span>
<span>{fmt(inv.support_amount)}</span>
</div>
)}
<div className='flex justify-between gap-2 border-t pt-1.5'>
<span className='font-medium'>Total</span>
<span className='font-semibold'>{fmt(inv.total_amount)}</span>
</div>
</div>

{/* Period & Dates */}
<div className='space-y-2'>
<p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide'>
Period
</p>
<div className='flex justify-between gap-2'>
<span className='text-muted-foreground'>Start</span>
<span>{fmtDate(inv.period_start)}</span>
</div>
<div className='flex justify-between gap-2'>
<span className='text-muted-foreground'>End</span>
<span>{fmtDate(inv.period_end)}</span>
</div>
<div className='flex justify-between gap-2'>
<span className='text-muted-foreground'>Due</span>
<span>{fmtDate(inv.due_date)}</span>
</div>
{inv.paid_at && (
<div className='flex justify-between gap-2'>
<span className='text-muted-foreground'>Paid</span>
<span className='text-green-600 dark:text-green-400'>
{fmtDate(inv.paid_at)}
</span>
</div>
)}
</div>
</div>
</div>
);
}

function GenerateDialog({
open,
onOpenChange,
onSuccess,
}: {
open: boolean;
onOpenChange: (o: boolean) => void;
onSuccess: () => void;
}) {
const [mode, setMode] = useState<'bulk' | 'client'>('bulk');
const [selectedClientId, setSelectedClientId] = useState('');
const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
const [year, setYear] = useState(THIS_YEAR);
const [isSubmitting, setIsSubmitting] = useState(false);

const { data: clientsData } = useQuery({
queryKey: ['clients-invoice-dialog'],
queryFn: () => api.get<{ items: DialogClient[] }>('/clients?limit=200'),
enabled: open,
staleTime: 60_000,
});
const clients = clientsData?.items ?? [];

const { data: projectsData, isLoading: projectsLoading } = useQuery({
queryKey: ['projects-for-invoice', selectedClientId],
queryFn: () =>
api.get<{ items: DialogProject[] }>(
`/projects?client_id=${selectedClientId}&limit=200`,
),
enabled: mode === 'client' && !!selectedClientId,
});
const projects = projectsData?.items ?? [];
const allSelected =
projects.length > 0 && selectedProjectIds.length === projects.length;

function toggleProject(id: number) {
setSelectedProjectIds(prev =>
prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
);
}

function toggleAll() {
if (allSelected) setSelectedProjectIds([]);
else setSelectedProjectIds(projects.map(p => p.id));
}

function resetState() {
setMode('bulk');
setSelectedClientId('');
setSelectedProjectIds([]);
setYear(THIS_YEAR);
}

async function handleSubmit(e: FormEvent<HTMLFormElement>) {
e.preventDefault();
setIsSubmitting(true);
try {
if (mode === 'bulk') {
const results = await api.post<
Array<{ projectId: number; invoiceNumber?: string; skipped?: string }>
>('/invoices/generate-bulk', { year });
const created = results.filter(r => r.invoiceNumber).length;
const skipped = results.filter(r => r.skipped).length;
toast({
title: `Created ${created} invoice(s) for ${year}${
skipped > 0 ? `, ${skipped} skipped` : ''
}`,
});
} else {
if (!selectedClientId) {
toast({ title: 'Select a client', variant: 'destructive' });
return;
}
const results = await api.post<
Array<{ projectId: number; invoiceNumber?: string; skipped?: string }>
>('/invoices/generate-client', {
clientId: Number(selectedClientId),
...(selectedProjectIds.length > 0 && {
projectIds: selectedProjectIds,
}),
year,
});
const created = results.filter(r => r.invoiceNumber).length;
const skipped = results.filter(r => r.skipped).length;
toast({
title: `Created ${created} invoice(s)${
skipped > 0 ? `, ${skipped} skipped (already exist)` : ''
}`,
});
}
resetState();
onSuccess();
onOpenChange(false);
} catch {
toast({ title: 'Generation failed', variant: 'destructive' });
} finally {
setIsSubmitting(false);
}
}

return (
<Dialog
open={open}
onOpenChange={o => {
if (!o) resetState();
onOpenChange(o);
}}
>
<DialogContent className='sm:max-w-md'>
<DialogHeader>
<DialogTitle>Generate Invoices</DialogTitle>
<DialogDescription>
Yearly invoices are calculated as monthly price × 12.
</DialogDescription>
</DialogHeader>
<form onSubmit={handleSubmit} className='space-y-4'>
{/* Mode toggle */}
<div className='flex gap-2'>
<button
type='button'
onClick={() => setMode('bulk')}
className={`flex-1 border rounded-md px-3 py-2 text-sm font-medium transition-colors ${
mode === 'bulk'
? 'bg-primary text-primary-foreground border-primary'
: 'hover:bg-accent'
}`}
>
All Projects
</button>
<button
type='button'
onClick={() => {
setMode('client');
setSelectedProjectIds([]);
}}
className={`flex-1 border rounded-md px-3 py-2 text-sm font-medium transition-colors ${
mode === 'client'
? 'bg-primary text-primary-foreground border-primary'
: 'hover:bg-accent'
}`}
>
By Client
</button>
</div>

{/* Year */}
<div className='space-y-1'>
<Label htmlFor='gen-year'>Year</Label>
<Select
value={String(year)}
onValueChange={v => setYear(Number(v))}
>
<SelectTrigger id='gen-year'>
<SelectValue />
</SelectTrigger>
<SelectContent>
{Array.from({ length: 6 }, (_, i) => THIS_YEAR + 1 - i).map(
y => (
<SelectItem key={y} value={String(y)}>
{y}
</SelectItem>
),
)}
</SelectContent>
</Select>
</div>

{/* Client + projects */}
{mode === 'client' && (
<>
<div className='space-y-1'>
<Label htmlFor='gen-client'>Client</Label>
<Select
value={selectedClientId}
onValueChange={v => {
setSelectedClientId(v);
setSelectedProjectIds([]);
}}
>
<SelectTrigger id='gen-client'>
<SelectValue placeholder='Select client…' />
</SelectTrigger>
<SelectContent>
{clients.map(c => (
<SelectItem key={c.id} value={String(c.id)}>
{c.name}
</SelectItem>
))}
</SelectContent>
</Select>
</div>

{selectedClientId && (
<div className='space-y-2'>
<div className='flex items-center justify-between'>
<Label>Projects</Label>
{projects.length > 0 && (
<button
type='button'
className='text-xs text-muted-foreground underline-offset-2 hover:underline'
onClick={toggleAll}
>
{allSelected ? 'Deselect all' : 'Select all'}
</button>
)}
</div>
{projectsLoading ? (
<p className='text-sm text-muted-foreground py-2'>
Loading projects…
</p>
) : projects.length === 0 ? (
<p className='text-sm text-muted-foreground py-2'>
No invoiceable projects for this client.
</p>
) : (
<div className='max-h-48 overflow-y-auto rounded-md border divide-y'>
{projects.map(p => (
<label
key={p.id}
className='flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors'
>
<input
type='checkbox'
className='mt-0.5 accent-primary'
checked={selectedProjectIds.includes(p.id)}
onChange={() => toggleProject(p.id)}
/>
<div className='min-w-0'>
<p className='text-sm font-medium truncate'>
{p.name}
</p>
<p className='text-xs text-muted-foreground'>
{[
p.hosting_package?.name,
p.support_package?.name,
]
.filter(Boolean)
.join(' · ') || 'No packages'}
</p>
</div>
</label>
))}
</div>
)}
{selectedProjectIds.length > 0 && (
<p className='text-xs text-muted-foreground'>
{selectedProjectIds.length} project
{selectedProjectIds.length !== 1 ? 's' : ''} selected
</p>
)}
</div>
)}
</>
)}

<DialogFooter>
<Button
type='button'
variant='outline'
onClick={() => {
resetState();
onOpenChange(false);
}}
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
const [expandedId, setExpandedId] = useState<number | null>(null);

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

function toggleExpand(inv: Invoice) {
setExpandedId(prev => (prev === inv.id ? null : inv.id));
}

const columns: Column<Invoice>[] = [
{
header: '',
headerClassName: 'w-8 px-2 py-3',
className: 'w-8 px-2 py-3',
render: inv =>
expandedId === inv.id ? (
<ChevronDown className='h-4 w-4 text-muted-foreground' />
) : (
<ChevronRight className='h-4 w-4 text-muted-foreground' />
),
},
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
render: inv => <span>{fmt(inv.hosting_amount)}</span>,
},
{
header: 'Support',
render: inv => <span>{fmt(inv.support_amount)}</span>,
},
{
header: 'Total',
render: inv => (
<span className='font-semibold'>{fmt(inv.total_amount)}</span>
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
{fmtDate(inv.due_date)}
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
onRowClick={toggleExpand}
expandedRowKey={expandedId}
renderExpandedRow={inv => <InvoiceDetailPanel inv={inv} />}
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
