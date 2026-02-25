import React, { useState, useEffect } from 'react';
import {
	FileText,
	Plus,
	Send,
	Download,
	CreditCard,
	Calendar,
	DollarSign,
	CheckCircle,
	Clock,
	AlertTriangle,
	XCircle,
	Eye,
	Trash2,
	Loader2,
} from 'lucide-react';
import { apiFetch } from '@/config/env';

interface Invoice {
	id: number;
	invoice_number: string;
	status: string;
	issue_date: string;
	due_date: string;
	total: number;
	balance_due: number;
	currency: string;
}

interface InvoiceItem {
	description: string;
	quantity: number;
	unit_price: number;
	total: number;
}

interface InvoicesTabProps {
	clientId: number;
	clientName: string;
	currency?: string;
}

const InvoicesTab: React.FC<InvoicesTabProps> = ({
	clientId,
	clientName,
	currency = 'USD',
}) => {
	const [invoices, setInvoices] = useState<Invoice[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

	// Create invoice form state
	const [items, setItems] = useState<InvoiceItem[]>([
		{ description: '', quantity: 1, unit_price: 0, total: 0 },
	]);
	const [notes, setNotes] = useState('');
	const [dueDate, setDueDate] = useState('');

	useEffect(() => {
		loadInvoices();
	}, [clientId]);

	const loadInvoices = async () => {
		setIsLoading(true);
		try {
			const res = await apiFetch(`/api/v1/clients/${clientId}/invoices`);
			if (res.ok) {
				const data = await res.json();
				setInvoices(data.invoices || []);
			}
		} catch (err) {
			setError('Failed to load invoices');
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	const createInvoice = async () => {
		try {
			const validItems = items.filter(i => i.description && i.unit_price > 0);

			const res = await apiFetch('/api/v1/invoices', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					client_id: clientId,
					items: validItems.map(i => ({
						description: i.description,
						quantity: i.quantity,
						unit_price: i.unit_price,
					})),
					notes,
					due_date: dueDate || undefined,
				}),
			});

			if (res.ok) {
				setShowCreateModal(false);
				setItems([{ description: '', quantity: 1, unit_price: 0, total: 0 }]);
				setNotes('');
				setDueDate('');
				loadInvoices();
			}
		} catch (err) {
			console.error('Failed to create invoice:', err);
		}
	};

	const sendInvoice = async (invoiceId: number) => {
		try {
			await apiFetch(`/api/v1/invoices/${invoiceId}/send`, { method: 'POST' });
			loadInvoices();
		} catch (err) {
			console.error('Failed to send invoice:', err);
		}
	};

	const recordPayment = async (invoiceId: number) => {
		const amount = prompt('Enter payment amount:');
		if (!amount) return;

		try {
			await apiFetch(`/api/v1/invoices/${invoiceId}/payment`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					amount: parseFloat(amount),
					payment_method: 'manual',
				}),
			});
			loadInvoices();
		} catch (err) {
			console.error('Failed to record payment:', err);
		}
	};

	const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
		const newItems = [...items];
		newItems[index] = { ...newItems[index], [field]: value };
		newItems[index].total =
			newItems[index].quantity * newItems[index].unit_price;
		setItems(newItems);
	};

	const addItem = () => {
		setItems([
			...items,
			{ description: '', quantity: 1, unit_price: 0, total: 0 },
		]);
	};

	const removeItem = (index: number) => {
		if (items.length > 1) {
			setItems(items.filter((_, i) => i !== index));
		}
	};

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'paid':
				return <CheckCircle className='w-4 h-4 text-green-500' />;
			case 'pending':
				return <Clock className='w-4 h-4 text-orange-500' />;
			case 'overdue':
				return <AlertTriangle className='w-4 h-4 text-red-500' />;
			case 'draft':
				return <FileText className='w-4 h-4 text-gray-400' />;
			default:
				return <XCircle className='w-4 h-4 text-gray-400' />;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'paid':
				return 'bg-green-100 text-green-800';
			case 'pending':
				return 'bg-orange-100 text-orange-800';
			case 'overdue':
				return 'bg-red-100 text-red-800';
			case 'draft':
				return 'bg-gray-100 text-gray-800';
			default:
				return 'bg-gray-100 text-gray-600';
		}
	};

	const formatCurrency = (amount: number) => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
		}).format(amount);
	};

	const calculateTotal = () => {
		return items.reduce((sum, item) => sum + item.total, 0);
	};

	if (isLoading) {
		return (
			<div className='flex items-center justify-center py-12'>
				<Loader2 className='w-6 h-6 animate-spin text-blue-500' />
				<span className='ml-2 text-gray-500'>Loading invoices...</span>
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h3 className='text-lg font-semibold text-gray-900'>Invoices</h3>
					<p className='text-sm text-gray-500'>{clientName}</p>
				</div>
				<button
					onClick={() => setShowCreateModal(true)}
					className='flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700'
				>
					<Plus className='w-4 h-4 mr-2' />
					Create Invoice
				</button>
			</div>

			{/* Summary Cards */}
			<div className='grid grid-cols-4 gap-4'>
				<div className='bg-white border rounded-lg p-4'>
					<div className='flex items-center text-gray-500 text-sm mb-1'>
						<FileText className='w-4 h-4 mr-1' />
						Total Invoiced
					</div>
					<div className='text-xl font-bold text-gray-900'>
						{formatCurrency(invoices.reduce((s, i) => s + i.total, 0))}
					</div>
				</div>
				<div className='bg-white border rounded-lg p-4'>
					<div className='flex items-center text-green-600 text-sm mb-1'>
						<CheckCircle className='w-4 h-4 mr-1' />
						Paid
					</div>
					<div className='text-xl font-bold text-green-700'>
						{formatCurrency(
							invoices
								.filter(i => i.status === 'paid')
								.reduce((s, i) => s + i.total, 0),
						)}
					</div>
				</div>
				<div className='bg-white border rounded-lg p-4'>
					<div className='flex items-center text-orange-600 text-sm mb-1'>
						<Clock className='w-4 h-4 mr-1' />
						Pending
					</div>
					<div className='text-xl font-bold text-orange-700'>
						{formatCurrency(
							invoices
								.filter(i => i.status === 'pending')
								.reduce((s, i) => s + i.balance_due, 0),
						)}
					</div>
				</div>
				<div className='bg-white border rounded-lg p-4'>
					<div className='flex items-center text-red-600 text-sm mb-1'>
						<AlertTriangle className='w-4 h-4 mr-1' />
						Overdue
					</div>
					<div className='text-xl font-bold text-red-700'>
						{formatCurrency(
							invoices
								.filter(i => i.status === 'overdue')
								.reduce((s, i) => s + i.balance_due, 0),
						)}
					</div>
				</div>
			</div>

			{/* Invoice List */}
			<div className='bg-white rounded-lg border overflow-hidden'>
				<table className='min-w-full divide-y divide-gray-200'>
					<thead className='bg-gray-50'>
						<tr>
							<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
								Invoice
							</th>
							<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
								Status
							</th>
							<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
								Issue Date
							</th>
							<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
								Due Date
							</th>
							<th className='px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase'>
								Total
							</th>
							<th className='px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase'>
								Balance
							</th>
							<th className='px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase'>
								Actions
							</th>
						</tr>
					</thead>
					<tbody className='divide-y divide-gray-200'>
						{invoices.map(invoice => (
							<tr key={invoice.id} className='hover:bg-gray-50'>
								<td className='px-6 py-4 whitespace-nowrap'>
									<span className='font-mono font-medium text-gray-900'>
										{invoice.invoice_number}
									</span>
								</td>
								<td className='px-6 py-4 whitespace-nowrap'>
									<span
										className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}
									>
										{getStatusIcon(invoice.status)}
										<span className='ml-1 capitalize'>{invoice.status}</span>
									</span>
								</td>
								<td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
									{invoice.issue_date}
								</td>
								<td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
									{invoice.due_date}
								</td>
								<td className='px-6 py-4 whitespace-nowrap text-sm text-right font-medium'>
									{formatCurrency(invoice.total)}
								</td>
								<td className='px-6 py-4 whitespace-nowrap text-sm text-right'>
									{invoice.balance_due > 0 ? (
										<span className='text-red-600 font-medium'>
											{formatCurrency(invoice.balance_due)}
										</span>
									) : (
										<span className='text-green-600'>Paid</span>
									)}
								</td>
								<td className='px-6 py-4 whitespace-nowrap text-right text-sm space-x-2'>
									{invoice.status === 'draft' && (
										<button
											onClick={() => sendInvoice(invoice.id)}
											className='text-blue-600 hover:text-blue-800'
											title='Send Invoice'
										>
											<Send className='w-4 h-4 inline' />
										</button>
									)}
									{invoice.status !== 'paid' && invoice.status !== 'draft' && (
										<button
											onClick={() => recordPayment(invoice.id)}
											className='text-green-600 hover:text-green-800'
											title='Record Payment'
										>
											<CreditCard className='w-4 h-4 inline' />
										</button>
									)}
									<button
										className='text-gray-400 hover:text-gray-600'
										title='Download PDF'
									>
										<Download className='w-4 h-4 inline' />
									</button>
								</td>
							</tr>
						))}
						{invoices.length === 0 && (
							<tr>
								<td
									colSpan={7}
									className='px-6 py-12 text-center text-gray-500'
								>
									No invoices yet. Create your first invoice above.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Create Invoice Modal */}
			{showCreateModal && (
				<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto'>
						<div className='px-6 py-4 border-b flex items-center justify-between'>
							<h3 className='text-lg font-semibold'>Create Invoice</h3>
							<button
								onClick={() => setShowCreateModal(false)}
								className='text-gray-400 hover:text-gray-600'
							>
								<XCircle className='w-5 h-5' />
							</button>
						</div>

						<div className='p-6 space-y-4'>
							{/* Due Date */}
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									<Calendar className='w-4 h-4 inline mr-1' />
									Due Date
								</label>
								<input
									type='date'
									value={dueDate}
									onChange={e => setDueDate(e.target.value)}
									className='w-full px-3 py-2 border rounded-lg'
								/>
							</div>

							{/* Line Items */}
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-2'>
									Line Items
								</label>
								<div className='space-y-2'>
									{items.map((item, index) => (
										<div key={index} className='flex gap-2 items-center'>
											<input
												type='text'
												placeholder='Description'
												value={item.description}
												onChange={e =>
													updateItem(index, 'description', e.target.value)
												}
												className='flex-1 px-3 py-2 border rounded-lg text-sm'
											/>
											<input
												type='number'
												placeholder='Qty'
												value={item.quantity}
												onChange={e =>
													updateItem(
														index,
														'quantity',
														parseFloat(e.target.value) || 0,
													)
												}
												className='w-20 px-3 py-2 border rounded-lg text-sm text-center'
											/>
											<input
												type='number'
												placeholder='Price'
												value={item.unit_price || ''}
												onChange={e =>
													updateItem(
														index,
														'unit_price',
														parseFloat(e.target.value) || 0,
													)
												}
												className='w-28 px-3 py-2 border rounded-lg text-sm text-right'
											/>
											<div className='w-28 text-right font-medium'>
												{formatCurrency(item.total)}
											</div>
											<button
												onClick={() => removeItem(index)}
												className='text-red-500 hover:text-red-700 p-1'
											>
												<Trash2 className='w-4 h-4' />
											</button>
										</div>
									))}
								</div>
								<button
									onClick={addItem}
									className='mt-2 text-sm text-blue-600 hover:text-blue-800'
								>
									+ Add line item
								</button>
							</div>

							{/* Notes */}
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Notes
								</label>
								<textarea
									value={notes}
									onChange={e => setNotes(e.target.value)}
									placeholder='Additional notes...'
									rows={2}
									className='w-full px-3 py-2 border rounded-lg text-sm'
								/>
							</div>

							{/* Total */}
							<div className='flex justify-end pt-4 border-t'>
								<div className='text-right'>
									<div className='text-sm text-gray-500'>Total</div>
									<div className='text-2xl font-bold text-gray-900'>
										{formatCurrency(calculateTotal())}
									</div>
								</div>
							</div>
						</div>

						<div className='px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3'>
							<button
								onClick={() => setShowCreateModal(false)}
								className='px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg'
							>
								Cancel
							</button>
							<button
								onClick={createInvoice}
								disabled={calculateTotal() === 0}
								className='px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50'
							>
								Create Invoice
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default InvoicesTab;
