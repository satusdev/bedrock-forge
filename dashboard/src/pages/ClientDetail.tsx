import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../services/api'; // Assuming getClients is here, might need getClient(id)
import { billingService } from '../services/billing';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
	User,
	Mail,
	Phone,
	Globe,
	Building,
	ArrowLeft,
	CreditCard,
	FileText,
	Server,
	Clock,
	Edit,
	Download,
	Send,
	Plus,
	X,
	DollarSign,
	Trash2,
	CheckCircle,
} from 'lucide-react';
import { Client } from './Clients';

interface InvoiceItem {
	description: string;
	quantity: number;
	unit_price: number;
	item_type?: string;
	project_id?: number;
}

interface Invoice {
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

const ClientDetail: React.FC = () => {
	const { clientId } = useParams<{ clientId: string }>();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<
		'overview' | 'services' | 'invoices'
	>('overview');
	const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
	const [showPaymentModal, setShowPaymentModal] = useState<number | null>(null);

	// In a real app we'd have a specific getClient(id) endpoint.
	// For now, we'll fetch all and find (inefficient but works for prototype/small data)
	// or assume we add getClient to API.
	// Let's assume dashboardApi.getClient(id) exists or we add it.
	// Looking at api.ts, there isn't a getClient(id) yet, only getClients().
	// I'll simulate it by fetching all clients or adding the method.
	// Since I can't easily change the backend *right now* to add the endpoint if it doesn't exist,
	// I will use getClients and filter client-side for this step.

	const { data: clientsData, isLoading } = useQuery({
		queryKey: ['clients'],
		queryFn: dashboardApi.getClients,
	});

	// Mock services/invoices data since backend endpoints might not fully support filtering by client yet
	const [services, setServices] = useState<any[]>([]);

	// Fetch invoices for this client
	const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
		queryKey: ['invoices', clientId],
		queryFn: () => billingService.getInvoices({ client_id: Number(clientId) }),
		enabled: !!clientId,
	});

	useEffect(() => {
		// Mock fetching services for this client
		const loadServices = async () => {
			// In reality: await billingService.getClientSubscriptions(clientId)
			try {
				const allSubs = await billingService.getSubscriptions();
				// Filter mock
				setServices(allSubs.filter(s => s.client_id.toString() === clientId));
			} catch (e) {
				console.error(e);
			}
		};
		if (clientId) loadServices();
	}, [clientId]);

	// Invoice handlers
	const handleDownloadPdf = async (invoiceId: number) => {
		try {
			const blob = await billingService.downloadInvoicePdf(invoiceId);
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `invoice_${invoiceId}.pdf`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (err) {
			console.error('Error downloading PDF:', err);
			alert('Failed to download invoice PDF');
		}
	};

	const handleSendInvoice = async (invoiceId: number) => {
		if (!confirm('Send this invoice to the client?')) return;
		try {
			await billingService.sendInvoice(invoiceId);
			queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
			alert('Invoice sent successfully');
		} catch (err) {
			console.error('Error sending invoice:', err);
			alert('Failed to send invoice');
		}
	};

	const handleDeleteInvoice = async (invoiceId: number) => {
		if (!confirm('Are you sure you want to delete this draft invoice?')) return;
		try {
			await billingService.deleteInvoice(invoiceId);
			queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
		} catch (err) {
			console.error('Error deleting invoice:', err);
			alert('Failed to delete invoice');
		}
	};

	const handleCreateInvoice = async (
		items: InvoiceItem[],
		options: { tax_rate?: number; discount_amount?: number; notes?: string }
	) => {
		try {
			await billingService.createInvoice({
				client_id: Number(clientId),
				items,
				tax_rate: options.tax_rate,
				discount_amount: options.discount_amount,
				notes: options.notes,
				currency: client?.currency || 'USD',
			});
			queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
			setShowCreateInvoiceModal(false);
		} catch (err) {
			console.error('Error creating invoice:', err);
			throw err;
		}
	};

	const handleRecordPayment = async (
		invoiceId: number,
		amount: number,
		method: string,
		reference?: string
	) => {
		try {
			await billingService.recordPayment(invoiceId, {
				amount,
				payment_method: method,
				payment_reference: reference,
			});
			queryClient.invalidateQueries({ queryKey: ['invoices', clientId] });
			setShowPaymentModal(null);
		} catch (err) {
			console.error('Error recording payment:', err);
			throw err;
		}
	};

	if (isLoading)
		return (
			<div className='flex justify-center p-8'>
				<LoadingSpinner />
			</div>
		);

	const client = clientsData?.data?.clients?.find(
		(c: Client) => c.id === clientId
	);

	if (!client) {
		return <div className='p-8 text-center'>Client not found</div>;
	}

	return (
		<div className='space-y-6'>
			<div className='flex items-center space-x-4'>
				<Button variant='ghost' onClick={() => navigate('/clients')}>
					<ArrowLeft className='w-5 h-5 mr-1' /> Back
				</Button>
				<h1 className='text-2xl font-bold text-gray-900'>{client.name}</h1>
				<Badge variant={client.active ? 'success' : 'default'}>
					{client.active ? 'Active' : 'Inactive'}
				</Badge>
			</div>

			{/* Tabs */}
			<div className='border-b border-gray-200'>
				<nav className='-mb-px flex space-x-8'>
					<button
						onClick={() => setActiveTab('overview')}
						className={`${
							activeTab === 'overview'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
					>
						Overview
					</button>
					<button
						onClick={() => setActiveTab('services')}
						className={`${
							activeTab === 'services'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
					>
						Services & Subscriptions
					</button>
					<button
						onClick={() => setActiveTab('invoices')}
						className={`${
							activeTab === 'invoices'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
					>
						Invoices
					</button>
				</nav>
			</div>

			{/* Content */}
			<div className='mt-6'>
				{activeTab === 'overview' && (
					<div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
						<Card title='Contact Information'>
							<div className='space-y-4 p-4'>
								<div className='flex items-center'>
									<Mail className='w-5 h-5 text-gray-400 mr-3' />
									<span>{client.email}</span>
								</div>
								{client.phone && (
									<div className='flex items-center'>
										<Phone className='w-5 h-5 text-gray-400 mr-3' />
										<span>{client.phone}</span>
									</div>
								)}
								{client.company && (
									<div className='flex items-center'>
										<Building className='w-5 h-5 text-gray-400 mr-3' />
										<span>{client.company}</span>
									</div>
								)}
								{client.website && (
									<div className='flex items-center'>
										<Globe className='w-5 h-5 text-gray-400 mr-3' />
										<a
											href={client.website}
											target='_blank'
											rel='noreferrer'
											className='text-blue-600 hover:underline'
										>
											{client.website}
										</a>
									</div>
								)}
							</div>
						</Card>

						<Card title='Billing Settings'>
							<div className='space-y-4 p-4'>
								<div className='flex justify-between border-b pb-2'>
									<span className='text-gray-500'>Rate</span>
									<span className='font-medium'>
										{client.currency} {client.monthly_retainer}
									</span>
								</div>
								<div className='flex justify-between border-b pb-2'>
									<span className='text-gray-500'>Cycle</span>
									<span className='font-medium capitalize'>
										monthly
									</span>
								</div>
								<div className='flex justify-between border-b pb-2'>
									<span className='text-gray-500'>Payment Method</span>
									<span className='font-medium'>
										{client.payment_terms || 'N/A'}
									</span>
								</div>
							</div>
						</Card>

						<Card title='Notes' className='md:col-span-2'>
							<div className='p-4 text-gray-600 whitespace-pre-wrap'>
								{client.notes || 'No notes available.'}
							</div>
						</Card>
					</div>
				)}

				{activeTab === 'services' && (
					<Card>
						<div className='p-4'>
							{services.length === 0 ? (
								<p className='text-gray-500 text-center py-4'>
									No active services found for this client.
								</p>
							) : (
								<div className='overflow-x-auto'>
									<table className='min-w-full divide-y divide-gray-200'>
										<thead>
											<tr>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Service
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Type
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Price
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Status
												</th>
											</tr>
										</thead>
										<tbody className='divide-y divide-gray-200'>
											{services.map((svc: any) => (
												<tr key={svc.id}>
													<td className='px-4 py-3 font-medium text-gray-900'>
														{svc.name}
													</td>
													<td className='px-4 py-3 text-gray-500 capitalize'>
														{svc.type}
													</td>
													<td className='px-4 py-3 text-gray-900'>
														{svc.currency} {svc.amount}
													</td>
													<td className='px-4 py-3'>
														<Badge
															className={
																svc.status === 'active'
																	? 'bg-green-100 text-green-800'
																	: 'bg-gray-100'
															}
														>
															{svc.status}
														</Badge>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
							<div className='mt-4 pt-4 border-t border-gray-100'>
								<Button>
									<Plus className='w-4 h-4 mr-2' /> Add Service
								</Button>
							</div>
						</div>
					</Card>
				)}

				{activeTab === 'invoices' && (
					<Card>
						<div className='p-4'>
							<div className='flex justify-between items-center mb-4'>
								<h3 className='text-lg font-medium'>Invoice History</h3>
								<Button onClick={() => setShowCreateInvoiceModal(true)}>
									<Plus className='w-4 h-4 mr-2' /> Create Invoice
								</Button>
							</div>

							{invoicesLoading ? (
								<div className='flex justify-center py-8'>
									<LoadingSpinner />
								</div>
							) : !invoicesData?.invoices ||
							  invoicesData.invoices.length === 0 ? (
								<div className='text-center py-12 text-gray-500'>
									<FileText className='w-12 h-12 mx-auto mb-3 text-gray-300' />
									<p>No invoices found for this client.</p>
								</div>
							) : (
								<div className='overflow-x-auto'>
									<table className='min-w-full divide-y divide-gray-200'>
										<thead>
											<tr>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Invoice #
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Issue Date
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Due Date
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Total
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Balance
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Status
												</th>
												<th className='px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase'>
													Actions
												</th>
											</tr>
										</thead>
										<tbody className='divide-y divide-gray-200'>
											{invoicesData.invoices.map((invoice: Invoice) => (
												<tr key={invoice.id}>
													<td className='px-4 py-3 font-medium text-gray-900'>
														{invoice.invoice_number}
													</td>
													<td className='px-4 py-3 text-gray-500'>
														{invoice.issue_date
															? new Date(
																	invoice.issue_date
															  ).toLocaleDateString()
															: '-'}
													</td>
													<td className='px-4 py-3 text-gray-500'>
														{invoice.due_date
															? new Date(invoice.due_date).toLocaleDateString()
															: '-'}
													</td>
													<td className='px-4 py-3 text-gray-900'>
														{invoice.currency} {invoice.total.toFixed(2)}
													</td>
													<td className='px-4 py-3 text-gray-900'>
														{invoice.currency} {invoice.balance_due.toFixed(2)}
													</td>
													<td className='px-4 py-3'>
														<Badge
															variant={
																invoice.status === 'paid'
																	? 'success'
																	: invoice.status === 'pending'
																	? 'warning'
																	: invoice.status === 'overdue'
																	? 'error'
																	: invoice.status === 'cancelled'
																	? 'error'
																	: 'default'
															}
														>
															{invoice.status}
														</Badge>
													</td>
													<td className='px-4 py-3'>
														<div className='flex items-center space-x-2'>
															<button
																onClick={() => handleDownloadPdf(invoice.id)}
																className='text-blue-600 hover:text-blue-800'
																title='Download PDF'
															>
																<Download className='w-4 h-4' />
															</button>
															{invoice.status === 'draft' && (
																<button
																	onClick={() => handleSendInvoice(invoice.id)}
																	className='text-green-600 hover:text-green-800'
																	title='Send Invoice'
																>
																	<Send className='w-4 h-4' />
																</button>
															)}
															{(invoice.status === 'pending' ||
																invoice.status === 'draft') &&
																invoice.balance_due > 0 && (
																	<button
																		onClick={() =>
																			setShowPaymentModal(invoice.id)
																		}
																		className='text-purple-600 hover:text-purple-800'
																		title='Record Payment'
																	>
																		<DollarSign className='w-4 h-4' />
																	</button>
																)}
															{invoice.status === 'draft' && (
																<button
																	onClick={() =>
																		handleDeleteInvoice(invoice.id)
																	}
																	className='text-red-600 hover:text-red-800'
																	title='Delete Invoice'
																>
																	<Trash2 className='w-4 h-4' />
																</button>
															)}
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</Card>
				)}
			</div>

			{/* Create Invoice Modal */}
			{showCreateInvoiceModal && client && (
				<CreateInvoiceModal
					clientId={Number(clientId)}
					services={services}
					currency={client.currency || 'USD'}
					onClose={() => setShowCreateInvoiceModal(false)}
					onSubmit={handleCreateInvoice}
				/>
			)}

			{/* Record Payment Modal */}
			{showPaymentModal && (
				<RecordPaymentModal
					invoiceId={showPaymentModal}
					onClose={() => setShowPaymentModal(null)}
					onSubmit={(amount, method, reference) =>
						handleRecordPayment(showPaymentModal, amount, method, reference)
					}
				/>
			)}
		</div>
	);
};

// Create Invoice Modal Component
interface CreateInvoiceModalProps {
	clientId: number;
	services: any[];
	currency: string;
	onClose: () => void;
	onSubmit: (
		items: InvoiceItem[],
		options: { tax_rate?: number; discount_amount?: number; notes?: string }
	) => Promise<void>;
}

const CreateInvoiceModal: React.FC<CreateInvoiceModalProps> = ({
	clientId,
	services,
	currency,
	onClose,
	onSubmit,
}) => {
	const [autoCalculate, setAutoCalculate] = useState(true);
	const [items, setItems] = useState<InvoiceItem[]>([]);
	const [taxRate, setTaxRate] = useState(0);
	const [discountAmount, setDiscountAmount] = useState(0);
	const [notes, setNotes] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Auto-populate from services
	useEffect(() => {
		if (autoCalculate && services.length > 0) {
			const serviceItems: InvoiceItem[] = services
				.filter(s => s.status === 'active')
				.map(s => ({
					description: `${s.name} - ${s.type}`,
					quantity: 1,
					unit_price: s.amount,
					item_type: s.type,
				}));
			setItems(serviceItems);
		}
	}, [autoCalculate, services]);

	const addItem = () => {
		setItems([...items, { description: '', quantity: 1, unit_price: 0 }]);
	};

	const removeItem = (index: number) => {
		setItems(items.filter((_, i) => i !== index));
	};

	const updateItem = (
		index: number,
		field: keyof InvoiceItem,
		value: string | number
	) => {
		const updated = [...items];
		updated[index] = { ...updated[index], [field]: value };
		setItems(updated);
	};

	const subtotal = items.reduce(
		(sum, item) => sum + item.quantity * item.unit_price,
		0
	);
	const taxAmount = subtotal * (taxRate / 100);
	const total = subtotal + taxAmount - discountAmount;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (items.length === 0) {
			alert('Please add at least one line item');
			return;
		}
		setIsSubmitting(true);
		try {
			await onSubmit(items, {
				tax_rate: taxRate,
				discount_amount: discountAmount,
				notes,
			});
		} catch (err) {
			alert('Failed to create invoice');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto'>
				<div className='flex items-center justify-between p-4 border-b'>
					<h2 className='text-xl font-semibold'>Create Invoice</h2>
					<button
						onClick={onClose}
						className='text-gray-500 hover:text-gray-700'
					>
						<X className='w-6 h-6' />
					</button>
				</div>

				<form onSubmit={handleSubmit} className='p-4 space-y-4'>
					{/* Auto-calculate toggle */}
					<div className='flex items-center space-x-3 bg-blue-50 p-3 rounded-lg'>
						<input
							type='checkbox'
							id='autoCalculate'
							checked={autoCalculate}
							onChange={e => {
								setAutoCalculate(e.target.checked);
								if (!e.target.checked) setItems([]);
							}}
							className='h-4 w-4 text-blue-600 rounded'
						/>
						<label htmlFor='autoCalculate' className='text-sm text-blue-800'>
							Auto-calculate from active services (
							{services.filter(s => s.status === 'active').length} active)
						</label>
					</div>

					{/* Line Items */}
					<div>
						<div className='flex justify-between items-center mb-2'>
							<h3 className='font-medium'>Line Items</h3>
							{!autoCalculate && (
								<Button
									type='button'
									variant='outline'
									size='sm'
									onClick={addItem}
								>
									<Plus className='w-4 h-4 mr-1' /> Add Item
								</Button>
							)}
						</div>

						<div className='space-y-2'>
							{items.map((item, index) => (
								<div
									key={index}
									className='flex items-center space-x-2 bg-gray-50 p-2 rounded'
								>
									<input
										type='text'
										value={item.description}
										onChange={e =>
											updateItem(index, 'description', e.target.value)
										}
										placeholder='Description'
										className='flex-1 px-2 py-1 border rounded text-sm'
										disabled={autoCalculate}
									/>
									<input
										type='number'
										value={item.quantity}
										onChange={e =>
											updateItem(
												index,
												'quantity',
												parseFloat(e.target.value) || 0
											)
										}
										className='w-20 px-2 py-1 border rounded text-sm'
										min='0'
										step='0.01'
										disabled={autoCalculate}
									/>
									<input
										type='number'
										value={item.unit_price}
										onChange={e =>
											updateItem(
												index,
												'unit_price',
												parseFloat(e.target.value) || 0
											)
										}
										className='w-24 px-2 py-1 border rounded text-sm'
										min='0'
										step='0.01'
										disabled={autoCalculate}
									/>
									<span className='w-24 text-right text-sm font-medium'>
										{currency} {(item.quantity * item.unit_price).toFixed(2)}
									</span>
									{!autoCalculate && (
										<button
											type='button'
											onClick={() => removeItem(index)}
											className='text-red-500 hover:text-red-700'
										>
											<Trash2 className='w-4 h-4' />
										</button>
									)}
								</div>
							))}
							{items.length === 0 && (
								<p className='text-gray-500 text-sm text-center py-4'>
									{autoCalculate
										? 'No active services found'
										: 'Click "Add Item" to add line items'}
								</p>
							)}
						</div>
					</div>

					{/* Tax & Discount */}
					<div className='grid grid-cols-2 gap-4'>
						<div>
							<label className='block text-sm font-medium mb-1'>
								Tax Rate (%)
							</label>
							<input
								type='number'
								value={taxRate}
								onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
								className='w-full px-3 py-2 border rounded'
								min='0'
								max='100'
								step='0.1'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium mb-1'>
								Discount ({currency})
							</label>
							<input
								type='number'
								value={discountAmount}
								onChange={e =>
									setDiscountAmount(parseFloat(e.target.value) || 0)
								}
								className='w-full px-3 py-2 border rounded'
								min='0'
								step='0.01'
							/>
						</div>
					</div>

					{/* Notes */}
					<div>
						<label className='block text-sm font-medium mb-1'>
							Notes (optional)
						</label>
						<textarea
							value={notes}
							onChange={e => setNotes(e.target.value)}
							className='w-full px-3 py-2 border rounded'
							rows={2}
							placeholder='Additional notes for the invoice...'
						/>
					</div>

					{/* Totals */}
					<div className='bg-gray-50 p-4 rounded-lg space-y-2'>
						<div className='flex justify-between text-sm'>
							<span>Subtotal:</span>
							<span>
								{currency} {subtotal.toFixed(2)}
							</span>
						</div>
						{taxRate > 0 && (
							<div className='flex justify-between text-sm'>
								<span>Tax ({taxRate}%):</span>
								<span>
									{currency} {taxAmount.toFixed(2)}
								</span>
							</div>
						)}
						{discountAmount > 0 && (
							<div className='flex justify-between text-sm text-green-600'>
								<span>Discount:</span>
								<span>
									-{currency} {discountAmount.toFixed(2)}
								</span>
							</div>
						)}
						<div className='flex justify-between font-bold text-lg border-t pt-2'>
							<span>Total:</span>
							<span>
								{currency} {total.toFixed(2)}
							</span>
						</div>
					</div>

					{/* Actions */}
					<div className='flex justify-end space-x-3 pt-4 border-t'>
						<Button type='button' variant='outline' onClick={onClose}>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting || items.length === 0}>
							{isSubmitting ? 'Creating...' : 'Create Invoice'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
};

// Record Payment Modal Component
interface RecordPaymentModalProps {
	invoiceId: number;
	onClose: () => void;
	onSubmit: (
		amount: number,
		method: string,
		reference?: string
	) => Promise<void>;
}

const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
	invoiceId,
	onClose,
	onSubmit,
}) => {
	const [amount, setAmount] = useState('');
	const [method, setMethod] = useState('bank_transfer');
	const [reference, setReference] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const amountNum = parseFloat(amount);
		if (!amountNum || amountNum <= 0) {
			alert('Please enter a valid payment amount');
			return;
		}
		setIsSubmitting(true);
		try {
			await onSubmit(amountNum, method, reference || undefined);
		} catch (err) {
			alert('Failed to record payment');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg shadow-xl w-full max-w-md'>
				<div className='flex items-center justify-between p-4 border-b'>
					<h2 className='text-xl font-semibold'>Record Payment</h2>
					<button
						onClick={onClose}
						className='text-gray-500 hover:text-gray-700'
					>
						<X className='w-6 h-6' />
					</button>
				</div>

				<form onSubmit={handleSubmit} className='p-4 space-y-4'>
					<div>
						<label className='block text-sm font-medium mb-1'>Amount *</label>
						<input
							type='number'
							value={amount}
							onChange={e => setAmount(e.target.value)}
							className='w-full px-3 py-2 border rounded'
							placeholder='0.00'
							min='0.01'
							step='0.01'
							required
						/>
					</div>

					<div>
						<label className='block text-sm font-medium mb-1'>
							Payment Method *
						</label>
						<select
							value={method}
							onChange={e => setMethod(e.target.value)}
							className='w-full px-3 py-2 border rounded'
							required
						>
							<option value='bank_transfer'>Bank Transfer</option>
							<option value='credit_card'>Credit Card</option>
							<option value='paypal'>PayPal</option>
							<option value='stripe'>Stripe</option>
							<option value='cash'>Cash</option>
							<option value='check'>Check</option>
							<option value='other'>Other</option>
						</select>
					</div>

					<div>
						<label className='block text-sm font-medium mb-1'>
							Reference (optional)
						</label>
						<input
							type='text'
							value={reference}
							onChange={e => setReference(e.target.value)}
							className='w-full px-3 py-2 border rounded'
							placeholder='Transaction ID, check number, etc.'
						/>
					</div>

					<div className='flex justify-end space-x-3 pt-4 border-t'>
						<Button type='button' variant='outline' onClick={onClose}>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							<CheckCircle className='w-4 h-4 mr-2' />
							{isSubmitting ? 'Recording...' : 'Record Payment'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default ClientDetail;
