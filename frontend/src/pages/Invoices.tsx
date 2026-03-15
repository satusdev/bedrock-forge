import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Download, FileText, Loader2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import { dashboardApi } from '@/services/api';
import toast from 'react-hot-toast';

interface InvoiceSummary {
	id: number;
	invoice_number: string;
	client_id: number;
	status: string;
	issue_date: string | null;
	due_date: string | null;
	total: number;
	balance_due: number;
	currency: string;
}

interface InvoiceDetail extends InvoiceSummary {
	paid_date?: string | null;
	subtotal?: number;
	tax_rate?: number;
	tax_amount?: number;
	discount_amount?: number;
	amount_paid?: number;
	payment_method?: string | null;
	payment_reference?: string | null;
	notes?: string | null;
	terms?: string | null;
	items: Array<{
		id: number;
		description: string;
		quantity: number;
		unit_price: number;
		total: number;
		item_type?: string | null;
		project_id?: number | null;
	}>;
}

export default function Invoices() {
	const queryClient = useQueryClient();
	const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(
		null,
	);

	const { data, isLoading } = useQuery({
		queryKey: ['invoices'],
		queryFn: () => dashboardApi.getInvoices({ limit: 50, offset: 0 }),
	});

	const invoices: InvoiceSummary[] = data?.data?.invoices || [];

	const fetchInvoiceDetail = async (invoiceId: number) => {
		try {
			const response = await dashboardApi.getInvoice(invoiceId);
			setSelectedInvoice(response.data as InvoiceDetail);
		} catch (error) {
			toast.error('Failed to load invoice');
		}
	};

	const markPaidMutation = useMutation({
		mutationFn: (invoice: InvoiceDetail) =>
			dashboardApi.recordInvoicePayment(invoice.id, {
				amount: invoice.balance_due,
				payment_method: 'manual',
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['invoices'] });
			if (selectedInvoice) {
				fetchInvoiceDetail(selectedInvoice.id);
			}
			toast.success('Invoice marked as paid');
		},
		onError: () => toast.error('Failed to record payment'),
	});

	const sendInvoiceMutation = useMutation({
		mutationFn: (invoiceId: number) => dashboardApi.sendInvoice(invoiceId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['invoices'] });
			toast.success('Invoice marked as sent');
		},
		onError: () => toast.error('Failed to send invoice'),
	});

	const downloadInvoice = async (invoiceId: number) => {
		try {
			const response = await dashboardApi.downloadInvoicePdf(invoiceId);
			const blob = new Blob([response.data], { type: 'application/pdf' });
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `invoice-${invoiceId}.pdf`;
			link.click();
			window.URL.revokeObjectURL(url);
		} catch (error) {
			toast.error('Failed to download PDF');
		}
	};

	const formatCurrency = (amount?: number, currency: string = 'USD') => {
		if (amount === undefined || amount === null) return '—';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
		}).format(amount);
	};

	const columns = useMemo<ColumnDef<InvoiceSummary>[]>(
		() => [
			{
				accessorKey: 'invoice_number',
				header: 'Invoice',
				cell: ({ row }) => (
					<span className='text-sm text-gray-700'>
						{row.original.invoice_number}
					</span>
				),
			},
			{
				accessorKey: 'status',
				header: 'Status',
				cell: ({ row }) => (
					<Badge variant='secondary'>{row.original.status}</Badge>
				),
			},
			{
				accessorKey: 'due_date',
				header: 'Due',
				cell: ({ row }) => (
					<span className='text-sm text-gray-600'>
						{row.original.due_date
							? new Date(row.original.due_date).toLocaleDateString()
							: '—'}
					</span>
				),
			},
			{
				accessorKey: 'total',
				header: 'Total',
				cell: ({ row }) => (
					<div className='text-right text-sm text-gray-700'>
						{formatCurrency(row.original.total, row.original.currency)}
					</div>
				),
			},
			{
				id: 'actions',
				header: 'Actions',
				cell: ({ row }) => (
					<div className='flex items-center justify-end gap-2'>
						<Button
							variant='secondary'
							onClick={() => fetchInvoiceDetail(row.original.id)}
						>
							View
						</Button>
						<Button
							variant='outline'
							onClick={() => downloadInvoice(row.original.id)}
						>
							<Download className='w-4 h-4 mr-1' />
							PDF
						</Button>
					</div>
				),
			},
		],
		[],
	);

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Invoices</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Manage invoices and payments
					</p>
				</div>
			</div>

			<Card>
				<DataTable
					columns={columns}
					data={invoices}
					showFilter={false}
					filterValue=''
					onFilterChange={() => {}}
					filterPlaceholder=''
					emptyMessage='No invoices found.'
					initialPageSize={10}
				/>
			</Card>

			{selectedInvoice && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
					<div className='bg-white rounded-2xl shadow-xl max-w-2xl w-full'>
						<div className='p-6 border-b border-gray-100 flex items-center justify-between'>
							<div>
								<h2 className='text-xl font-bold text-gray-900'>
									Invoice {selectedInvoice.invoice_number}
								</h2>
								<p className='text-sm text-gray-500'>
									Status: {selectedInvoice.status}
								</p>
							</div>
							<Button variant='ghost' onClick={() => setSelectedInvoice(null)}>
								Close
							</Button>
						</div>

						<div className='p-6 space-y-4'>
							<div className='grid grid-cols-2 gap-4'>
								<Card>
									<p className='text-xs text-gray-500'>Total</p>
									<p className='text-lg font-semibold'>
										{formatCurrency(
											selectedInvoice.total,
											selectedInvoice.currency,
										)}
									</p>
								</Card>
								<Card>
									<p className='text-xs text-gray-500'>Balance Due</p>
									<p className='text-lg font-semibold'>
										{formatCurrency(
											selectedInvoice.balance_due,
											selectedInvoice.currency,
										)}
									</p>
								</Card>
							</div>

							<div>
								<h3 className='text-sm font-semibold text-gray-700'>
									Line Items
								</h3>
								<div className='mt-2 space-y-2'>
									{selectedInvoice.items.map(item => (
										<div key={item.id} className='flex justify-between text-sm'>
											<span>{item.description}</span>
											<span>
												{formatCurrency(item.total, selectedInvoice.currency)}
											</span>
										</div>
									))}
								</div>
							</div>
						</div>

						<div className='p-6 border-t border-gray-100 flex justify-end gap-2'>
							<Button
								variant='outline'
								onClick={() => downloadInvoice(selectedInvoice.id)}
							>
								<FileText className='w-4 h-4 mr-2' />
								Download PDF
							</Button>
							{selectedInvoice.status === 'paid' && (
								<Button
									variant='secondary'
									onClick={() => downloadInvoice(selectedInvoice.id)}
								>
									<Download className='w-4 h-4 mr-2' />
									Receipt
								</Button>
							)}
							{selectedInvoice.status === 'draft' && (
								<Button
									variant='secondary'
									onClick={() => sendInvoiceMutation.mutate(selectedInvoice.id)}
									disabled={sendInvoiceMutation.isPending}
								>
									{sendInvoiceMutation.isPending && (
										<Loader2 className='w-4 h-4 mr-2 animate-spin' />
									)}
									Mark as Sent
								</Button>
							)}
							{selectedInvoice.status !== 'paid' && (
								<Button
									variant='primary'
									onClick={() => markPaidMutation.mutate(selectedInvoice)}
									disabled={markPaidMutation.isPending}
								>
									{markPaidMutation.isPending && (
										<Loader2 className='w-4 h-4 mr-2 animate-spin' />
									)}
									Mark Paid
								</Button>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
