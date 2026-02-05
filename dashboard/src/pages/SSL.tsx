import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { billingService } from '../services/billing';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import SummaryCard from '../components/ui/SummaryCard';
import {
	RefreshCw,
	Plus,
	Shield,
	CheckCircle,
	AlertTriangle,
	XCircle,
	Edit2,
	Trash2,
	X,
	Loader2,
	Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SSLCertificate {
	id: number;
	common_name: string;
	provider: string;
	issue_date: string;
	expiry_date: string;
	auto_renew: boolean;
	days_until_expiry: number;
	notes?: string;
}

const SSL_PROVIDERS = [
	{ value: 'letsencrypt', label: "Let's Encrypt" },
	{ value: 'cloudflare', label: 'Cloudflare' },
	{ value: 'cyberpanel', label: 'CyberPanel' },
	{ value: 'comodo', label: 'Comodo' },
	{ value: 'digicert', label: 'DigiCert' },
	{ value: 'sectigo', label: 'Sectigo' },
	{ value: 'godaddy', label: 'GoDaddy' },
	{ value: 'namecheap', label: 'Namecheap' },
	{ value: 'other', label: 'Other' },
];

const SSL: React.FC = () => {
	const queryClient = useQueryClient();
	const [showAddModal, setShowAddModal] = useState(false);
	const [editingCert, setEditingCert] = useState<SSLCertificate | null>(null);

	const {
		data: certificates = [],
		isLoading,
		isRefetching,
	} = useQuery({
		queryKey: ['ssl-certificates'],
		queryFn: async () => {
			const data = await billingService.getCertificates();
			return data.map((c: any) => ({
				id: c.id,
				common_name: c.common_name || c.domain,
				provider: c.provider || c.issuer,
				issue_date: c.issue_date,
				expiry_date: c.expiry_date,
				auto_renew: c.auto_renew,
				days_until_expiry: c.days_until_expiry,
				notes: c.notes,
			}));
		},
	});

	const deleteMutation = useMutation({
		mutationFn: billingService.deleteCertificate,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] });
			toast.success('Certificate removed');
		},
		onError: () => toast.error('Failed to delete certificate'),
	});

	const handleDelete = (cert: SSLCertificate) => {
		if (confirm(`Remove certificate for ${cert.common_name}?`)) {
			deleteMutation.mutate(cert.id);
		}
	};

	// Stats
	const validCount = certificates.filter(
		(c: SSLCertificate) => c.days_until_expiry > 14
	).length;
	const expiringCount = certificates.filter(
		(c: SSLCertificate) => c.days_until_expiry > 0 && c.days_until_expiry <= 14
	).length;
	const expiredCount = certificates.filter(
		(c: SSLCertificate) => c.days_until_expiry <= 0
	).length;

	const getStatusBadge = (cert: SSLCertificate) => {
		if (cert.days_until_expiry <= 0) {
			return <Badge variant='danger'>Expired</Badge>;
		}
		if (cert.days_until_expiry <= 14) {
			return <Badge variant='warning'>Expiring</Badge>;
		}
		return <Badge variant='success'>Valid</Badge>;
	};

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
			<div className='flex justify-between items-center'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
						SSL Certificates
					</h1>
					<p className='text-gray-600 dark:text-gray-400'>
						Track SSL certificates and expiry dates
					</p>
				</div>
				<div className='flex space-x-3'>
					<Button
						variant='secondary'
						onClick={() =>
							queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] })
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
						Add Certificate
					</Button>
				</div>
			</div>

			{/* Stats Cards */}
			<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
				<SummaryCard
					title='Total'
					value={certificates.length}
					icon={Shield}
					iconPosition='right'
					iconClassName='w-6 h-6 text-blue-600 dark:text-blue-400'
					iconContainerClassName='bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg'
				/>
				<SummaryCard
					title='Valid'
					value={validCount}
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

			{/* Certificates Table */}
			<Card>
				<div className='overflow-x-auto'>
					<table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
						<thead className='bg-gray-50 dark:bg-gray-800'>
							<tr>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
									Domain
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
									Status
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
									Provider
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
									Expires
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
									Auto-Renew
								</th>
								<th className='px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
									Actions
								</th>
							</tr>
						</thead>
						<tbody className='bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700'>
							{certificates.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className='px-6 py-16 text-center text-gray-400'
									>
										<Shield className='w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600' />
										<p className='text-sm font-medium'>
											No SSL certificates tracked
										</p>
										<p className='text-xs mt-1'>
											Add your first certificate using the button above
										</p>
									</td>
								</tr>
							) : (
								certificates.map((cert: SSLCertificate) => (
									<tr
										key={cert.id}
										className='hover:bg-gray-50 dark:hover:bg-gray-800'
									>
										<td className='px-6 py-4'>
											<div className='text-sm font-medium text-gray-900 dark:text-white'>
												{cert.common_name}
											</div>
										</td>
										<td className='px-6 py-4'>{getStatusBadge(cert)}</td>
										<td className='px-6 py-4 text-sm text-gray-600 dark:text-gray-300 capitalize'>
											{cert.provider?.replace('_', ' ') || 'Unknown'}
										</td>
										<td className='px-6 py-4'>
											<div
												className={`text-sm ${
													cert.days_until_expiry <= 14
														? 'text-red-600 font-medium'
														: 'text-gray-900 dark:text-white'
												}`}
											>
												{cert.expiry_date}
											</div>
											<div className='text-xs text-gray-500 dark:text-gray-400'>
												{cert.days_until_expiry > 0
													? `${cert.days_until_expiry} days left`
													: `${Math.abs(cert.days_until_expiry)} days ago`}
											</div>
										</td>
										<td className='px-6 py-4'>
											<Badge variant={cert.auto_renew ? 'success' : 'default'}>
												{cert.auto_renew ? 'Yes' : 'No'}
											</Badge>
										</td>
										<td className='px-6 py-4 text-right'>
											<div className='flex justify-end space-x-2'>
												<Button
													size='sm'
													variant='secondary'
													onClick={() => setEditingCert(cert)}
												>
													<Edit2 className='w-4 h-4' />
												</Button>
												<Button
													size='sm'
													variant='secondary'
													className='text-red-600 hover:text-red-700'
													onClick={() => handleDelete(cert)}
												>
													<Trash2 className='w-4 h-4' />
												</Button>
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</Card>

			{/* Add/Edit Modal */}
			{(showAddModal || editingCert) && (
				<SSLModal
					certificate={editingCert}
					onClose={() => {
						setShowAddModal(false);
						setEditingCert(null);
					}}
					onSuccess={() => {
						queryClient.invalidateQueries({ queryKey: ['ssl-certificates'] });
						setShowAddModal(false);
						setEditingCert(null);
					}}
				/>
			)}
		</div>
	);
};

// SSL Modal Component
interface SSLModalProps {
	certificate: SSLCertificate | null;
	onClose: () => void;
	onSuccess: () => void;
}

const SSLModal: React.FC<SSLModalProps> = ({
	certificate,
	onClose,
	onSuccess,
}) => {
	const [formData, setFormData] = useState({
		common_name: certificate?.common_name || '',
		provider: certificate?.provider || 'letsencrypt',
		issue_date:
			certificate?.issue_date || new Date().toISOString().split('T')[0],
		expiry_date: certificate?.expiry_date || '',
		auto_renew: certificate?.auto_renew ?? true,
		notes: certificate?.notes || '',
	});
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData.common_name || !formData.expiry_date) {
			toast.error('Please fill in required fields');
			return;
		}

		setIsSubmitting(true);
		try {
			if (certificate) {
				await billingService.updateCertificate(certificate.id, formData);
				toast.success('Certificate updated');
			} else {
				await billingService.createCertificate(formData);
				toast.success('Certificate added');
			}
			onSuccess();
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Failed to save certificate');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4'>
				<div className='flex items-center justify-between p-4 border-b dark:border-gray-700'>
					<h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
						{certificate ? 'Edit Certificate' : 'Add Certificate'}
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
							Domain / Common Name *
						</label>
						<input
							type='text'
							value={formData.common_name}
							onChange={e =>
								setFormData({ ...formData, common_name: e.target.value })
							}
							placeholder='example.com or *.example.com'
							className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
							disabled={!!certificate}
							required
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
							Provider
						</label>
						<select
							value={formData.provider}
							onChange={e =>
								setFormData({ ...formData, provider: e.target.value })
							}
							className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
						>
							{SSL_PROVIDERS.map(p => (
								<option key={p.value} value={p.value}>
									{p.label}
								</option>
							))}
						</select>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Issue Date
							</label>
							<input
								type='date'
								value={formData.issue_date}
								onChange={e =>
									setFormData({ ...formData, issue_date: e.target.value })
								}
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500'
							/>
						</div>

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
							Auto-renew enabled (e.g., Let's Encrypt)
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
								<Lock className='w-4 h-4 mr-2' />
							)}
							{certificate ? 'Save Changes' : 'Add Certificate'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default SSL;
