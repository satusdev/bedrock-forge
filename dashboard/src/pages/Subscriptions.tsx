import React, { useState, useEffect } from 'react';
import {
	billingService,
	Subscription,
	HostingPackage,
} from '../services/billing';
import { dashboardApi } from '../services/api';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { RefreshCw, Plus, FileText, XCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const Subscriptions: React.FC = () => {
	const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [packages, setPackages] = useState<HostingPackage[]>([]);
	const [clients, setClients] = useState<any[]>([]);
	const [projects, setProjects] = useState<any[]>([]);
	const [creating, setCreating] = useState(false);
	const [createForm, setCreateForm] = useState({
		client_id: '',
		project_id: '',
		package_id: '',
		start_date: '',
	});

	const fetchSubscriptions = async () => {
		try {
			const data = await billingService.getSubscriptions();
			setSubscriptions(data);
		} catch (error) {
			toast.error('Failed to load subscriptions');
			console.error(error);
			setSubscriptions([]);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	useEffect(() => {
		fetchSubscriptions();
	}, []);

	useEffect(() => {
		if (!showCreateModal) return;
		const loadOptions = async () => {
			try {
				const [pkgData, clientData, projectData] = await Promise.all([
					billingService.getPackages(),
					dashboardApi.getClients(),
					dashboardApi.getProjects(),
				]);
				setPackages(pkgData || []);
				setClients(clientData?.data?.clients || []);
				setProjects(projectData?.data || []);
			} catch (error) {
				toast.error('Failed to load subscription options');
			}
		};
		loadOptions();
	}, [showCreateModal]);

	const handleRefresh = () => {
		setRefreshing(true);
		fetchSubscriptions();
	};

	const handleRenew = async (id: number) => {
		try {
			await billingService.renewSubscription(id);
			toast.success('Subscription renewed successfully');
			handleRefresh();
		} catch (error) {
			toast.error('Failed to renew subscription');
		}
	};

	const handleCancel = async (id: number) => {
		if (!window.confirm('Are you sure you want to cancel this subscription?'))
			return;
		try {
			await billingService.cancelSubscription(id);
			toast.success('Subscription cancelled');
			handleRefresh();
		} catch (error) {
			toast.error('Failed to cancel subscription');
		}
	};

	const getStatusBadge = (status: string) => {
		switch (status) {
			case 'active':
				return <Badge className='bg-green-100 text-green-800'>Active</Badge>;
			case 'suspended':
				return <Badge className='bg-red-100 text-red-800'>Suspended</Badge>;
			case 'cancelled':
				return <Badge className='bg-gray-100 text-gray-800'>Cancelled</Badge>;
			case 'pending':
				return <Badge className='bg-yellow-100 text-yellow-800'>Pending</Badge>;
			default:
				return <Badge className='bg-gray-100 text-gray-800'>{status}</Badge>;
		}
	};

	if (loading) {
		return (
			<div className='flex justify-center items-center h-64'>
				<LoadingSpinner />
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			<div className='flex justify-between items-center'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Subscriptions</h1>
					<p className='text-gray-600'>Manage recurring billing and services</p>
				</div>
				<div className='flex space-x-3'>
					<Button
						variant='outline'
						onClick={handleRefresh}
						disabled={refreshing}
					>
						<RefreshCw
							className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`}
						/>
						Refresh
					</Button>
					<Button onClick={() => setShowCreateModal(true)}>
						<Plus className='w-4 h-4 mr-2' />
						New Subscription
					</Button>
				</div>
			</div>

			<Card>
				<div className='overflow-x-auto'>
					<table className='min-w-full divide-y divide-gray-200'>
						<thead className='bg-gray-50'>
							<tr>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
									Service
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
									Client
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
									Amount
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
									Billing Cycle
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
									Status
								</th>
								<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
									Next Billing
								</th>
								<th className='px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider'>
									Actions
								</th>
							</tr>
						</thead>
						<tbody className='bg-white divide-y divide-gray-200'>
							{subscriptions.length === 0 ? (
								<tr>
									<td
										colSpan={7}
										className='px-6 py-4 text-center text-gray-500'
									>
										No subscriptions found
									</td>
								</tr>
							) : (
								subscriptions.map(sub => (
									<tr key={sub.id} className='hover:bg-gray-50'>
										<td className='px-6 py-4'>
											<div className='text-sm font-medium text-gray-900'>
												{sub.name}
											</div>
											<div className='text-xs text-gray-500 capitalize'>
												{sub.type}
											</div>
										</td>
										<td className='px-6 py-4 text-sm text-gray-600'>
											{sub.client_name || `Client #${sub.client_id}`}
										</td>
										<td className='px-6 py-4 text-sm font-medium text-gray-900'>
											{sub.currency} {sub.amount.toFixed(2)}
										</td>
										<td className='px-6 py-4 text-sm text-gray-600 capitalize'>
											{sub.billing_cycle}
										</td>
										<td className='px-6 py-4'>{getStatusBadge(sub.status)}</td>
										<td className='px-6 py-4 text-sm text-gray-600'>
											{sub.next_billing_date}
										</td>
										<td className='px-6 py-4 text-right text-sm font-medium'>
											<div className='flex justify-end space-x-2'>
												<button
													className='text-gray-400 hover:text-blue-600'
													title='Generate Invoice'
												>
													<FileText className='w-5 h-5' />
												</button>
												<button
													onClick={() => handleRenew(sub.id)}
													className='text-gray-400 hover:text-green-600'
													title='Renew Now'
												>
													<CheckCircle className='w-5 h-5' />
												</button>
												<button
													onClick={() => handleCancel(sub.id)}
													className='text-gray-400 hover:text-red-600'
													title='Cancel Subscription'
												>
													<XCircle className='w-5 h-5' />
												</button>
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</Card>

			{showCreateModal && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
					<div className='bg-white rounded-xl shadow-xl max-w-xl w-full'>
						<div className='flex items-center justify-between px-6 py-4 border-b'>
							<div>
								<h2 className='text-lg font-semibold text-gray-900'>
									New Subscription
								</h2>
								<p className='text-sm text-gray-500'>
									Creates hosting + support subscriptions
								</p>
							</div>
							<button
								className='text-gray-400 hover:text-gray-600'
								onClick={() => setShowCreateModal(false)}
							>
								<XCircle className='w-5 h-5' />
							</button>
						</div>

						<div className='px-6 py-4 space-y-4'>
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Client
								</label>
								<select
									className='w-full border rounded-lg px-3 py-2'
									value={createForm.client_id}
									onChange={e =>
										setCreateForm({ ...createForm, client_id: e.target.value })
									}
								>
									<option value=''>Select client</option>
									{clients.map((client: any) => (
										<option key={client.id} value={client.id}>
											{client.name}
										</option>
									))}
								</select>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Project
								</label>
								<select
									className='w-full border rounded-lg px-3 py-2'
									value={createForm.project_id}
									onChange={e =>
										setCreateForm({ ...createForm, project_id: e.target.value })
									}
								>
									<option value=''>Select project</option>
									{projects.map((project: any) => (
										<option key={project.id} value={project.id}>
											{project.name || project.project_name}
										</option>
									))}
								</select>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Package
								</label>
								<select
									className='w-full border rounded-lg px-3 py-2'
									value={createForm.package_id}
									onChange={e =>
										setCreateForm({ ...createForm, package_id: e.target.value })
									}
								>
									<option value=''>Select package</option>
									{packages.map(pkg => (
										<option key={pkg.id} value={pkg.id}>
											{pkg.name} • {pkg.currency || 'LYD'}{' '}
											{pkg.hosting_yearly_price?.toFixed(0)}/yr +{' '}
											{pkg.support_monthly_price?.toFixed(0)}/mo
										</option>
									))}
								</select>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Start Date
								</label>
								<input
									type='date'
									className='w-full border rounded-lg px-3 py-2'
									value={createForm.start_date}
									onChange={e =>
										setCreateForm({ ...createForm, start_date: e.target.value })
									}
								/>
							</div>
						</div>

						<div className='flex justify-end gap-2 px-6 py-4 border-t'>
							<Button
								variant='secondary'
								onClick={() => setShowCreateModal(false)}
							>
								Cancel
							</Button>
							<Button
								variant='primary'
								disabled={
									creating || !createForm.client_id || !createForm.package_id
								}
								onClick={async () => {
									try {
										setCreating(true);
										await billingService.createSubscription({
											client_id: Number(createForm.client_id),
											project_id: createForm.project_id
												? Number(createForm.project_id)
												: undefined,
											package_id: Number(createForm.package_id),
											start_date: createForm.start_date || undefined,
											create_hosting: true,
											create_support: true,
										});
										toast.success('Subscriptions created');
										setShowCreateModal(false);
										setCreateForm({
											client_id: '',
											project_id: '',
											package_id: '',
											start_date: '',
										});
										handleRefresh();
									} catch (error) {
										toast.error('Failed to create subscriptions');
									} finally {
										setCreating(false);
									}
								}}
							>
								{creating ? 'Creating…' : 'Create Subscriptions'}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Subscriptions;
