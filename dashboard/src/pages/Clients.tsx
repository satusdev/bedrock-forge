import React, { useEffect, useState } from 'react';
import { Link } from '@/router/compat';
import { useQueryClient } from '@tanstack/react-query';
import {
	Users,
	Plus,
	Search,
	Building,
	Mail,
	Phone,
	Globe,
	DollarSign,
	Calendar,
	Edit,
	Trash2,
	FolderKanban,
	CheckCircle,
	AlertTriangle,
	X,
	Clock,
	MapPin,
	CreditCard,
	RefreshCw,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import LabeledTextarea from '@/components/ui/LabeledTextarea';
import SummaryCard from '@/components/ui/SummaryCard';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import {
	useClient,
	useClientTags,
	useClientsList,
	useCreateClient,
	useDeleteClient,
	useSetClientTags,
	useTags,
	useUpdateClient,
} from '@/hooks/useClients';
import type { TagOption } from '@/hooks/useClients';
import type {
	ClientBillingStatus,
	ClientCreateInput,
	ClientDetail,
	ClientListItem,
	ClientUpdateInput,
} from '@/types';
import toast from 'react-hot-toast';

type ClientFormPayload = ClientCreateInput &
	ClientUpdateInput & { tag_ids?: number[] };

const Clients: React.FC = () => {
	const [searchQuery, setSearchQuery] = useState('');
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
	const [sortBy, setSortBy] = useState<'name' | 'created' | 'projects'>(
		'created',
	);

	const queryClient = useQueryClient();

	// Set up real-time updates
	const { isConnected } = useRealTimeUpdates({
		onWordPressUpdate: (projectName, data) => {
			// Refresh clients when client assignments change
			if (data.type?.includes('client')) {
				queryClient.invalidateQueries(['clients']);
			}
		},
	});

	// Fetch clients
	const { data: clients = [], isLoading, refetch } = useClientsList();

	const { data: tagOptions = [] } = useTags();

	const { data: selectedClientTags = [] } = useClientTags(
		selectedClientId,
		!!selectedClientId,
	);

	const { data: selectedClientDetails, isLoading: isSelectedClientLoading } =
		useClient(selectedClientId, showEditModal);

	const selectedClientTagIds = selectedClientTags.map(tag => tag.id);

	const createClientMutation = useCreateClient();
	const updateClientMutation = useUpdateClient();
	const deleteClientMutation = useDeleteClient();
	const setClientTagsMutation = useSetClientTags();

	// Filter and sort clients
	const filteredClients = clients
		.filter(client => {
			if (!searchQuery) return true;
			const searchLower = searchQuery.toLowerCase();
			return (
				client.name.toLowerCase().includes(searchLower) ||
				client.email.toLowerCase().includes(searchLower) ||
				client.company?.toLowerCase().includes(searchLower)
			);
		})
		.sort((a, b) => {
			switch (sortBy) {
				case 'name':
					return a.name.localeCompare(b.name);
				case 'created':
					return (
						new Date(b.created_at || 0).getTime() -
						new Date(a.created_at || 0).getTime()
					);
				case 'projects':
					return b.project_count - a.project_count;
				default:
					return 0;
			}
		});

	const handleCreateClient = async (clientData: ClientFormPayload) => {
		const { tag_ids = [], ...payload } = clientData;
		try {
			const response = await createClientMutation.mutateAsync(payload);
			const clientId = response?.data?.client_id;
			if (clientId && tag_ids?.length) {
				await setClientTagsMutation.mutateAsync({
					clientId,
					tagIds: tag_ids,
				});
			}
			toast.success('Client created successfully!');
			setShowCreateModal(false);
			refetch();
		} catch (error: any) {
			toast.error(
				`Failed to create client: ${
					error.response?.data?.detail || error.message
				}`,
			);
		}
	};

	const handleUpdateClient = async (clientData: ClientFormPayload) => {
		if (!selectedClientId) return;
		const { tag_ids = [], ...payload } = clientData;
		try {
			await updateClientMutation.mutateAsync({
				clientId: selectedClientId,
				clientData: payload,
			});
			if (tag_ids?.length) {
				await setClientTagsMutation.mutateAsync({
					clientId: selectedClientId,
					tagIds: tag_ids,
				});
			}
			toast.success('Client updated successfully!');
			setShowEditModal(false);
			setSelectedClientId(null);
			refetch();
		} catch (error: any) {
			toast.error(
				`Failed to update client: ${
					error.response?.data?.detail || error.message
				}`,
			);
		}
	};

	const handleDeleteClient = async (client: ClientListItem) => {
		if (
			window.confirm(
				`Are you sure you want to delete client "${client.name}"? This action cannot be undone.`,
			)
		) {
			try {
				await deleteClientMutation.mutateAsync(client.id);
				toast.success('Client deleted successfully!');
				refetch();
			} catch (error: any) {
				toast.error(
					`Failed to delete client: ${
						error.response?.data?.detail || error.message
					}`,
				);
			}
		}
	};

	const formatDate = (dateString?: string | null) => {
		if (!dateString) return '-';
		return new Date(dateString).toLocaleDateString();
	};

	const formatCurrency = (amount: number, currency: string = 'USD') => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency,
			minimumFractionDigits: 0,
		}).format(amount);
	};

	const getStatusBadge = (status?: ClientBillingStatus | null) => {
		switch (status) {
			case 'active':
				return { variant: 'success' as const, text: 'Active' };
			case 'trial':
				return { variant: 'warning' as const, text: 'Trial' };
			case 'overdue':
				return { variant: 'danger' as const, text: 'Overdue' };
			case 'cancelled':
				return { variant: 'default' as const, text: 'Cancelled' };
			case 'inactive':
				return { variant: 'default' as const, text: 'Inactive' };
			default:
				return { variant: 'default' as const, text: 'Unknown' };
		}
	};

	const getBillingCycleText = (cycle: string) => {
		switch (cycle) {
			case 'monthly':
				return 'Monthly';
			case 'quarterly':
				return 'Quarterly';
			case 'yearly':
				return 'Yearly';
			default:
				return cycle;
		}
	};

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Clients</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Manage client information and billing
					</p>
				</div>
				<div className='flex items-center space-x-3'>
					{/* Connection Status */}
					<div className='flex items-center space-x-2 px-3 py-1 rounded-lg bg-gray-100'>
						{isConnected ? (
							<div className='w-2 h-2 bg-green-500 rounded-full'></div>
						) : (
							<div className='w-2 h-2 bg-red-500 rounded-full'></div>
						)}
						<span className='text-sm text-gray-700'>
							{isConnected ? 'Live' : 'Offline'}
						</span>
					</div>
					<Button variant='primary' onClick={() => setShowCreateModal(true)}>
						<Plus className='w-4 h-4 mr-2' />
						Add Client
					</Button>
				</div>
			</div>

			{/* Stats Cards */}
			<div className='grid grid-cols-1 md:grid-cols-4 gap-6'>
				<SummaryCard
					title='Total Clients'
					value={clients.length}
					icon={Users}
					iconClassName='w-6 h-6 text-blue-600'
					iconContainerClassName='p-3 rounded-lg bg-blue-100'
				/>
				<SummaryCard
					title='Active Clients'
					value={clients.filter(c => c.billing_status === 'active').length}
					icon={CheckCircle}
					iconClassName='w-6 h-6 text-green-600'
					iconContainerClassName='p-3 rounded-lg bg-green-100'
				/>
				<SummaryCard
					title='Total Projects'
					value={clients.reduce(
						(total, client) => total + client.project_count,
						0,
					)}
					icon={FolderKanban}
					iconClassName='w-6 h-6 text-purple-600'
					iconContainerClassName='p-3 rounded-lg bg-purple-100'
				/>
				<SummaryCard
					title='Avg. Monthly Rate'
					value={
						clients.length > 0
							? formatCurrency(
									clients.reduce(
										(total, client) => total + (client.monthly_retainer || 0),
										0,
									) / clients.length,
									clients[0].currency || 'USD',
								)
							: '$0'
					}
					icon={DollarSign}
					iconClassName='w-6 h-6 text-yellow-600'
					iconContainerClassName='p-3 rounded-lg bg-yellow-100'
				/>
			</div>

			{/* Search and Filter */}
			<Card>
				<div className='flex items-center justify-between'>
					<div className='flex items-center space-x-4 flex-1'>
						<div className='relative flex-1 max-w-md'>
							<Search className='w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400' />
							<input
								type='text'
								placeholder='Search clients...'
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
								className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
							/>
						</div>
						<select
							value={sortBy}
							onChange={e =>
								setSortBy(e.target.value as 'name' | 'created' | 'projects')
							}
							className='px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
						>
							<option value='created'>Sort by Created</option>
							<option value='name'>Sort by Name</option>
							<option value='projects'>Sort by Projects</option>
						</select>
					</div>
					<Button
						variant='secondary'
						onClick={() => refetch()}
						disabled={isLoading}
					>
						<RefreshCw
							className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
						/>
						Refresh
					</Button>
				</div>
			</Card>

			{/* Clients List */}
			<Card>
				{isLoading ? (
					<div className='text-center py-12'>
						<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto'></div>
						<p className='mt-3 text-gray-500'>Loading clients...</p>
					</div>
				) : filteredClients.length === 0 ? (
					<div className='text-center py-12'>
						<Users className='w-12 h-12 mx-auto mb-3 text-gray-300' />
						<h3 className='text-lg font-medium text-gray-900 mb-2'>
							No Clients Found
						</h3>
						<p className='text-gray-500 mb-4'>
							Add your first client to get started
						</p>
						<Button onClick={() => setShowCreateModal(true)}>
							<Plus className='w-4 h-4 mr-2' />
							Add Client
						</Button>
					</div>
				) : (
					<div className='space-y-4'>
						{filteredClients.map(client => {
							const statusBadge = getStatusBadge(client.billing_status);
							return (
								<div
									key={client.id}
									className='border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow'
								>
									<div className='flex items-start justify-between'>
										<div className='flex items-start space-x-4 flex-1'>
											<div className='w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center'>
												<Users className='w-6 h-6 text-primary-600' />
											</div>
											<div className='flex-1'>
												<div className='flex items-center space-x-3'>
													<Link
														to={`/clients/${client.id}`}
														className='text-lg font-medium text-gray-900 hover:text-blue-600'
													>
														{client.name}
													</Link>
													<Badge variant={statusBadge.variant}>
														{statusBadge.text}
													</Badge>
												</div>

												<div className='flex items-center space-x-6 mt-2 text-sm text-gray-500'>
													{client.email && (
														<span className='flex items-center'>
															<Mail className='w-4 h-4 mr-1' />
															{client.email}
														</span>
													)}
													{client.company && (
														<span className='flex items-center'>
															<Building className='w-4 h-4 mr-1' />
															{client.company}
														</span>
													)}
													{client.phone && (
														<span className='flex items-center'>
															<Phone className='w-4 h-4 mr-1' />
															{client.phone}
														</span>
													)}
												</div>

												<div className='flex items-center space-x-6 mt-3 text-sm'>
													<span className='flex items-center'>
														<FolderKanban className='w-4 h-4 mr-1' />
														{client.project_count} projects
													</span>
													<span className='flex items-center'>
														<Calendar className='w-4 h-4 mr-1' />
														Created {formatDate(client.created_at)}
													</span>
													<span className='flex items-center'>
														<DollarSign className='w-4 h-4 mr-1' />
														{formatCurrency(
															client.monthly_retainer || 0,
															client.currency || 'USD',
														)}
														/{getBillingCycleText('monthly')}
													</span>
												</div>

												{(client.projects?.length || 0) > 0 && (
													<div className='mt-3'>
														<p className='text-sm font-medium text-gray-700 mb-2'>
															Projects:
														</p>
														<div className='flex flex-wrap gap-2'>
															{(client.projects || []).map(project => (
																<Badge
																	key={project.project_name}
																	variant='secondary'
																	className='text-xs'
																>
																	{project.project_name}
																</Badge>
															))}
														</div>
													</div>
												)}
											</div>
										</div>

										<div className='flex items-center space-x-2'>
											<Button
												variant='secondary'
												size='sm'
												onClick={() => {
													setSelectedClientId(client.id);
													setShowEditModal(true);
												}}
											>
												<Edit className='w-4 h-4 mr-1' />
												Edit
											</Button>
											<Button
												variant='ghost'
												size='sm'
												onClick={() => handleDeleteClient(client)}
												className='text-red-600 hover:text-red-700'
											>
												<Trash2 className='w-4 h-4' />
											</Button>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</Card>

			{/* Create Client Modal */}
			{showCreateModal && (
				<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto'>
						<div className='flex items-center justify-between mb-4'>
							<h3 className='text-lg font-medium text-gray-900'>
								Add New Client
							</h3>
							<Button
								variant='ghost'
								size='sm'
								onClick={() => setShowCreateModal(false)}
							>
								<X className='w-4 h-4' />
							</Button>
						</div>

						<ClientForm
							onSubmit={handleCreateClient}
							onCancel={() => setShowCreateModal(false)}
							isLoading={createClientMutation.isLoading}
							tagOptions={tagOptions}
						/>
					</div>
				</div>
			)}

			{/* Edit Client Modal */}
			{showEditModal && selectedClientId && (
				<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto'>
						<div className='flex items-center justify-between mb-4'>
							<h3 className='text-lg font-medium text-gray-900'>Edit Client</h3>
							<Button
								variant='ghost'
								size='sm'
								onClick={() => {
									setShowEditModal(false);
									setSelectedClientId(null);
								}}
							>
								<X className='w-4 h-4' />
							</Button>
						</div>

						{isSelectedClientLoading && !selectedClientDetails ? (
							<div className='py-8 text-center text-gray-500'>
								Loading client details...
							</div>
						) : (
							<ClientForm
								initialData={selectedClientDetails}
								initialTagIds={selectedClientTagIds}
								onSubmit={handleUpdateClient}
								onCancel={() => {
									setShowEditModal(false);
									setSelectedClientId(null);
								}}
								isLoading={updateClientMutation.isLoading}
								tagOptions={tagOptions}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

// Client Form Component
interface ClientFormProps {
	initialData?: ClientDetail;
	initialTagIds?: number[];
	onSubmit: (data: ClientFormPayload) => void;
	onCancel: () => void;
	isLoading?: boolean;
	tagOptions: TagOption[];
}

interface ClientFormState {
	name: string;
	email: string;
	phone: string;
	company: string;
	website: string;
	billing_email: string;
	address: string;
	payment_terms: number;
	currency: string;
	tax_rate: number;
	monthly_rate: number;
	notes: string;
}

const ClientForm: React.FC<ClientFormProps> = ({
	initialData,
	initialTagIds = [],
	onSubmit,
	onCancel,
	isLoading = false,
	tagOptions,
}) => {
	const [formData, setFormData] = useState<ClientFormState>({
		name: initialData?.name || '',
		email: initialData?.email || '',
		phone: initialData?.phone || '',
		company: initialData?.company || '',
		website: initialData?.website || '',
		billing_email: initialData?.billing_email || '',
		address: initialData?.address || '',
		payment_terms: Number(initialData?.payment_terms || 30),
		currency: initialData?.currency || 'USD',
		tax_rate: Number(initialData?.tax_rate || 0),
		monthly_rate: Number(initialData?.monthly_retainer || 0),
		notes: initialData?.notes || '',
	});
	const [tagIds, setTagIds] = useState<number[]>(initialTagIds);

	useEffect(() => {
		setTagIds(initialTagIds);
	}, [initialTagIds]);

	useEffect(() => {
		if (!initialData) return;
		setFormData({
			name: initialData.name || '',
			email: initialData.email || '',
			phone: initialData.phone || '',
			company: initialData.company || '',
			website: initialData.website || '',
			billing_email: initialData.billing_email || '',
			address: initialData.address || '',
			payment_terms: Number(initialData.payment_terms || 30),
			currency: initialData.currency || 'USD',
			tax_rate: Number(initialData.tax_rate || 0),
			monthly_rate: Number(initialData.monthly_retainer || 0),
			notes: initialData.notes || '',
		});
	}, [initialData]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSubmit({
			...formData,
			payment_terms: Number(formData.payment_terms) || 0,
			tax_rate: Number(formData.tax_rate) || 0,
			monthly_rate: Number(formData.monthly_rate) || 0,
			tag_ids: tagIds,
		});
	};

	const handleChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>,
	) => {
		const { name, value } = e.target;
		const numberFields = new Set(['payment_terms', 'tax_rate', 'monthly_rate']);

		setFormData(prev => ({
			...prev,
			[name]: numberFields.has(name) ? Number(value) : value,
		}));
	};

	const toggleTag = (tagId: number) => {
		setTagIds(prev =>
			prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId],
		);
	};

	return (
		<form onSubmit={handleSubmit} className='space-y-4'>
			<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
				<LabeledInput
					label='Name'
					name='name'
					type='text'
					value={formData.name}
					onChange={handleChange}
					required
				/>
				<LabeledInput
					label='Email'
					name='email'
					type='email'
					value={formData.email}
					onChange={handleChange}
					required
				/>
				<LabeledInput
					label='Phone'
					name='phone'
					type='tel'
					value={formData.phone}
					onChange={handleChange}
				/>
				<LabeledInput
					label='Company'
					name='company'
					type='text'
					value={formData.company}
					onChange={handleChange}
				/>
				<LabeledInput
					label='Website'
					name='website'
					type='url'
					value={formData.website}
					onChange={handleChange}
					placeholder='https://'
				/>
				<LabeledTextarea
					label='Notes'
					name='notes'
					value={formData.notes}
					onChange={handleChange}
					rows={3}
				/>
			</div>

			<div className='border-t border-gray-200 pt-4'>
				<h4 className='text-md font-medium text-gray-900 mb-4'>
					Billing Information
				</h4>
				<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
					<LabeledInput
						label='Monthly Rate'
						name='monthly_rate'
						type='number'
						value={formData.monthly_rate}
						onChange={handleChange}
						min='0'
						step='0.01'
					/>
					<LabeledInput
						label='Payment Terms (days)'
						name='payment_terms'
						type='number'
						value={formData.payment_terms}
						onChange={handleChange}
						min='0'
					/>
					<LabeledSelect
						label='Currency'
						name='currency'
						value={formData.currency}
						onChange={handleChange}
					>
						<option value='USD'>USD</option>
						<option value='EUR'>EUR</option>
						<option value='GBP'>GBP</option>
					</LabeledSelect>
					<LabeledInput
						label='Tax Rate (%)'
						name='tax_rate'
						type='number'
						value={formData.tax_rate}
						onChange={handleChange}
						min='0'
						step='0.01'
					/>
					<LabeledInput
						label='Billing Email'
						name='billing_email'
						type='email'
						value={formData.billing_email}
						onChange={handleChange}
					/>
					<LabeledInput
						label='Billing Address'
						name='address'
						type='text'
						value={formData.address}
						onChange={handleChange}
					/>
				</div>
			</div>

			<div className='border-t border-gray-200 pt-4'>
				<h4 className='text-md font-medium text-gray-900 mb-4'>Tags</h4>
				<div className='flex flex-wrap gap-2'>
					{tagOptions.length === 0 && (
						<span className='text-sm text-gray-500'>No tags available</span>
					)}
					{tagOptions.map(tag => (
						<button
							key={tag.id}
							type='button'
							onClick={() => toggleTag(tag.id)}
							className={`inline-flex items-center px-3 py-1 rounded-full text-sm border transition ${
								tagIds.includes(tag.id)
									? 'border-transparent text-white'
									: 'border-gray-300 text-gray-700'
							}`}
							style={{
								backgroundColor: tagIds.includes(tag.id)
									? tag.color
									: 'transparent',
							}}
						>
							{tag.name}
						</button>
					))}
				</div>
			</div>

			<div className='flex justify-end space-x-3 pt-4 border-t border-gray-200'>
				<Button variant='secondary' onClick={onCancel}>
					Cancel
				</Button>
				<Button type='submit' disabled={isLoading} className='min-w-[100px]'>
					{isLoading
						? 'Saving...'
						: initialData
							? 'Update Client'
							: 'Create Client'}
				</Button>
			</div>
		</form>
	);
};

export default Clients;
