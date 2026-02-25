import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { billingService } from '../services/billing';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import SummaryCard from '../components/ui/SummaryCard';
import {
	Plus,
	RefreshCw,
	Search,
	Globe,
	AlertTriangle,
	CheckCircle,
	XCircle,
	Calendar,
	Edit2,
	Trash2,
	X,
	Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Domain {
	id: number;
	domain_name: string;
	registrar: string;
	expiry_date: string;
	status: string;
	auto_renew: boolean;
	days_until_expiry: number;
	annual_cost?: number;
	dns_provider?: string;
	notes?: string;
}

const REGISTRARS = [
	{ value: 'namecheap', label: 'Namecheap' },
	{ value: 'godaddy', label: 'GoDaddy' },
	{ value: 'cloudflare', label: 'Cloudflare' },
	{ value: 'porkbun', label: 'Porkbun' },
	{ value: 'google_domains', label: 'Google Domains' },
	{ value: 'name_com', label: 'Name.com' },
	{ value: 'dynadot', label: 'Dynadot' },
	{ value: 'hover', label: 'Hover' },
	{ value: 'other', label: 'Other' },
];

const Domains: React.FC = () => {
	const queryClient = useQueryClient();
	const [searchTerm, setSearchTerm] = useState('');
	const [showAddModal, setShowAddModal] = useState(false);
	const [editingDomain, setEditingDomain] = useState<Domain | null>(null);

	const {
		data: domains = [],
		isLoading,
		isRefetching,
	} = useQuery({
		queryKey: ['domains'],
		queryFn: billingService.getDomains,
	});

	const deleteMutation = useMutation({
		mutationFn: billingService.deleteDomain,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['domains'] });
			toast.success('Domain removed');
		},
		onError: () => toast.error('Failed to delete domain'),
	});

	const refreshWhoisMutation = useMutation({
		mutationFn: (domainId: number) =>
			billingService.refreshDomainWhois(domainId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['domains'] });
			toast.success('WHOIS refreshed');
		},
		onError: () => toast.error('WHOIS refresh failed'),
	});

	const filteredDomains = domains.filter((d: Domain) =>
		d.domain_name.toLowerCase().includes(searchTerm.toLowerCase()),
	);

	// Stats
	const totalCount = domains.length;
	const activeCount = domains.filter(
		(d: Domain) => d.days_until_expiry > 30,
	).length;
	const expiringCount = domains.filter(
		(d: Domain) => d.days_until_expiry > 0 && d.days_until_expiry <= 30,
	).length;
	const expiredCount = domains.filter(
		(d: Domain) => d.days_until_expiry <= 0,
	).length;

	const handleDelete = (domain: Domain) => {
		if (confirm(`Remove ${domain.domain_name} from tracking?`)) {
			deleteMutation.mutate(domain.id);
		}
	};

	const getStatusBadge = (domain: Domain) => {
		if (domain.days_until_expiry <= 0) {
			return <Badge variant='danger'>Expired</Badge>;
		}
		if (domain.days_until_expiry <= 30) {
			return <Badge variant='warning'>Expiring Soon</Badge>;
		}
		return <Badge variant='success'>Active</Badge>;
	};

	const columns = useMemo<ColumnDef<Domain>[]>(
		() => [
			{
				id: 'domain',
				header: 'Domain',
				cell: ({ row }) => (
					<div>
						<div className='text-sm font-medium text-gray-900 dark:text-white'>
							{row.original.domain_name}
						</div>
						{row.original.dns_provider && (
							<div className='text-xs text-gray-500 dark:text-gray-400'>
								DNS: {row.original.dns_provider}
							</div>
						)}
					</div>
				),
			},
			{
				id: 'status',
				header: 'Status',
				cell: ({ row }) => getStatusBadge(row.original),
			},
			{
				id: 'registrar',
				header: 'Registrar',
				cell: ({ row }) => (
					<span className='text-sm text-gray-600 dark:text-gray-300 capitalize'>
						{row.original.registrar?.replace('_', ' ') || 'Unknown'}
					</span>
				),
			},
			{
				id: 'expires',
				header: 'Expires',
				cell: ({ row }) => (
					<div>
						<div
							className={`text-sm ${
								row.original.days_until_expiry <= 30
									? 'text-red-600 font-medium'
									: 'text-gray-900 dark:text-white'
							}`}
						>
							{row.original.expiry_date}
						</div>
						<div className='text-xs text-gray-500 dark:text-gray-400'>
							{row.original.days_until_expiry > 0
								? `${row.original.days_until_expiry} days left`
								: `${Math.abs(row.original.days_until_expiry)} days ago`}
						</div>
					</div>
				),
			},
			{
				id: 'auto-renew',
				header: 'Auto-Renew',
				cell: ({ row }) => (
					<Badge variant={row.original.auto_renew ? 'success' : 'default'}>
						{row.original.auto_renew ? 'Yes' : 'No'}
					</Badge>
				),
			},
			{
				id: 'actions',
				header: 'Actions',
				cell: ({ row }) => (
					<div className='flex justify-end space-x-2'>
						<Button
							size='sm'
							variant='secondary'
							onClick={() => refreshWhoisMutation.mutate(row.original.id)}
							disabled={refreshWhoisMutation.isPending}
						>
							<RefreshCw
								className={`w-4 h-4 ${
									refreshWhoisMutation.isPending ? 'animate-spin' : ''
								}`}
							/>
						</Button>
						<Button
							size='sm'
							variant='secondary'
							onClick={() => setEditingDomain(row.original)}
						>
							<Edit2 className='w-4 h-4' />
						</Button>
						<Button
							size='sm'
							variant='secondary'
							className='text-red-600 hover:text-red-700'
							onClick={() => handleDelete(row.original)}
						>
							<Trash2 className='w-4 h-4' />
						</Button>
					</div>
				),
			},
		],
		[],
	);

	if (isLoading) {
		return (
			<div className='flex justify-center items-center h-64'>
				<LoadingSpinner />
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
						Domains
					</h1>
					<p className='text-gray-600 dark:text-gray-400'>
						Track domain registration and expiry dates
					</p>
				</div>
				<div className='flex space-x-3 w-full sm:w-auto'>
					<Button
						variant='secondary'
						onClick={() =>
							queryClient.invalidateQueries({ queryKey: ['domains'] })
						}
						disabled={isRefetching}
					>
						<RefreshCw
							className={`w-4 h-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`}
						/>
						Refresh
					</Button>
					<Button onClick={() => setShowAddModal(true)}>
						<Plus className='w-4 h-4 mr-2' />
						Add Domain
					</Button>
				</div>
			</div>

			{/* Stats Cards */}
			<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
				<SummaryCard
					title='Total'
					value={totalCount}
					icon={Globe}
					iconPosition='right'
					iconClassName='w-6 h-6 text-blue-600 dark:text-blue-400'
					iconContainerClassName='bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg'
				/>
				<SummaryCard
					title='Active'
					value={activeCount}
					icon={CheckCircle}
					iconPosition='right'
					valueClassName='text-2xl font-bold text-green-600'
					iconClassName='w-6 h-6 text-green-600 dark:text-green-400'
					iconContainerClassName='bg-green-100 dark:bg-green-900/30 p-3 rounded-lg'
				/>
				<SummaryCard
					title='Expiring Soon'
					value={expiringCount}
					icon={AlertTriangle}
					iconPosition='right'
					valueClassName='text-2xl font-bold text-yellow-600'
					iconClassName='w-6 h-6 text-yellow-600 dark:text-yellow-400'
					iconContainerClassName='bg-yellow-100 dark:bg-yellow-900/30 p-3 rounded-lg'
				/>
				<SummaryCard
					title='Expired'
					value={expiredCount}
					icon={XCircle}
					iconPosition='right'
					valueClassName='text-2xl font-bold text-red-600'
					iconClassName='w-6 h-6 text-red-600 dark:text-red-400'
					iconContainerClassName='bg-red-100 dark:bg-red-900/30 p-3 rounded-lg'
				/>
			</div>

			{/* Search */}
			<div className='relative max-w-md'>
				<div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
					<Search className='h-5 w-5 text-gray-400' />
				</div>
				<input
					type='text'
					className='block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-transparent'
					placeholder='Search domains...'
					value={searchTerm}
					onChange={e => setSearchTerm(e.target.value)}
				/>
			</div>

			{/* Domains Table */}
			<Card>
				<DataTable
					columns={columns}
					data={filteredDomains}
					showFilter={false}
					filterValue=''
					onFilterChange={() => {}}
					filterPlaceholder=''
					emptyMessage='No domains tracked.'
					initialPageSize={10}
				/>
			</Card>

			{/* Add/Edit Modal */}
			{(showAddModal || editingDomain) && (
				<DomainModal
					domain={editingDomain}
					onClose={() => {
						setShowAddModal(false);
						setEditingDomain(null);
					}}
					onSuccess={() => {
						queryClient.invalidateQueries({ queryKey: ['domains'] });
						setShowAddModal(false);
						setEditingDomain(null);
					}}
				/>
			)}
		</div>
	);
};

// Domain Modal Component
interface DomainModalProps {
	domain: Domain | null;
	onClose: () => void;
	onSuccess: () => void;
}

const DomainModal: React.FC<DomainModalProps> = ({
	domain,
	onClose,
	onSuccess,
}) => {
	const [formData, setFormData] = useState({
		domain_name: domain?.domain_name || '',
		registrar: domain?.registrar || 'namecheap',
		expiry_date: domain?.expiry_date || '',
		auto_renew: domain?.auto_renew ?? true,
		annual_cost: domain?.annual_cost || 0,
		dns_provider: domain?.dns_provider || 'Cloudflare',
		notes: domain?.notes || '',
		client_id: 1, // Default client for now
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData.domain_name || !formData.expiry_date) {
			toast.error('Please fill in required fields');
			return;
		}

		setIsSubmitting(true);
		try {
			if (domain) {
				await billingService.updateDomain(domain.id, formData);
				toast.success('Domain updated');
			} else {
				await billingService.createDomain(formData);
				toast.success('Domain added');
			}
			onSuccess();
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Failed to save domain');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4'>
				<div className='flex items-center justify-between p-4 border-b dark:border-gray-700'>
					<h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
						{domain ? 'Edit Domain' : 'Add Domain'}
					</h2>
					<button
						onClick={onClose}
						className='text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
					>
						<X className='w-6 h-6' />
					</button>
				</div>

				<form onSubmit={handleSubmit} className='p-4 space-y-4'>
					<div>
						<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
							Domain Name *
						</label>
						<input
							type='text'
							value={formData.domain_name}
							onChange={e =>
								setFormData({ ...formData, domain_name: e.target.value })
							}
							placeholder='example.com'
							className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
							disabled={!!domain}
							required
						/>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Registrar
							</label>
							<select
								value={formData.registrar}
								onChange={e =>
									setFormData({ ...formData, registrar: e.target.value })
								}
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
							>
								{REGISTRARS.map(r => (
									<option key={r.value} value={r.value}>
										{r.label}
									</option>
								))}
							</select>
						</div>

						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								DNS Provider
							</label>
							<input
								type='text'
								value={formData.dns_provider}
								onChange={e =>
									setFormData({ ...formData, dns_provider: e.target.value })
								}
								placeholder='Cloudflare'
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
							/>
						</div>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Expiry Date *
							</label>
							<input
								type='date'
								value={formData.expiry_date}
								onChange={e =>
									setFormData({ ...formData, expiry_date: e.target.value })
								}
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
								required
							/>
						</div>

						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Annual Cost (USD)
							</label>
							<input
								type='number'
								step='0.01'
								value={formData.annual_cost}
								onChange={e =>
									setFormData({
										...formData,
										annual_cost: parseFloat(e.target.value) || 0,
									})
								}
								placeholder='12.00'
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
							/>
						</div>
					</div>

					<div className='flex items-center'>
						<input
							type='checkbox'
							id='auto_renew'
							checked={formData.auto_renew}
							onChange={e =>
								setFormData({ ...formData, auto_renew: e.target.checked })
							}
							className='h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded'
						/>
						<label
							htmlFor='auto_renew'
							className='ml-2 text-sm text-gray-700 dark:text-gray-300'
						>
							Auto-renew enabled
						</label>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
							Notes
						</label>
						<textarea
							value={formData.notes}
							onChange={e =>
								setFormData({ ...formData, notes: e.target.value })
							}
							placeholder='Optional notes...'
							rows={2}
							className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
						/>
					</div>

					<div className='flex justify-end space-x-3 pt-4 border-t dark:border-gray-700'>
						<Button type='button' variant='secondary' onClick={onClose}>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isSubmitting ? (
								<Loader2 className='w-4 h-4 mr-2 animate-spin' />
							) : (
								<Calendar className='w-4 h-4 mr-2' />
							)}
							{domain ? 'Save Changes' : 'Add Domain'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default Domains;
