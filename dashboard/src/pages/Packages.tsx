import React, { useState, useEffect } from 'react';
import { billingService } from '../services/billing';
import { dashboardApi } from '../services/api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import PackageEditor from '../components/billing/PackageEditor';
import {
	Plus,
	RefreshCw,
	Edit,
	Server,
	Database,
	HardDrive,
	Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Package {
	id: number;
	name: string;
	description?: string;
	disk_quota_mb: number;
	bandwidth_mb: number;
	db_limit: number;
	site_limit: number;
	price_monthly: number;
	price_yearly: number;
	is_active: boolean;
}

const Packages: React.FC = () => {
	const [packages, setPackages] = useState<Package[]>([]);
	const [loading, setLoading] = useState(true);
	const [isEditorOpen, setIsEditorOpen] = useState(false);
	const [editingPackage, setEditingPackage] = useState<Package | undefined>(
		undefined
	);
	const [clients, setClients] = useState<any[]>([]);
	const [projects, setProjects] = useState<any[]>([]);
	const [purchaseForm, setPurchaseForm] = useState({
		package_id: '',
		client_id: '',
		project_id: '',
		create_hosting: true,
		create_support: true,
	});

	const fetchPackages = async () => {
		try {
			const data = await billingService.getPackages();
			setPackages(data);
		} catch (error) {
			toast.error('Failed to load packages');
			setPackages([]);
		} finally {
			setLoading(false);
		}
	};

	const fetchClientsAndProjects = async () => {
		try {
			const [clientsResponse, projectsResponse] = await Promise.all([
				dashboardApi.getClients(),
				dashboardApi.getProjects(),
			]);
			setClients(clientsResponse.data?.clients || []);
			setProjects(projectsResponse.data || []);
		} catch {
			setClients([]);
			setProjects([]);
		}
	};

	useEffect(() => {
		fetchPackages();
		fetchClientsAndProjects();
	}, []);

	const handleEdit = (pkg: Package) => {
		setEditingPackage(pkg);
		setIsEditorOpen(true);
	};

	const handleCreate = () => {
		setEditingPackage(undefined);
		setIsEditorOpen(true);
	};

	const handleSave = async (data: any) => {
		// In a real app, call API to save/create
		console.log('Saving package:', data);
		toast.success('Package saved (mock)');
		setIsEditorOpen(false);
		fetchPackages(); // Refresh list
	};

	const handleManualPurchase = async () => {
		if (!purchaseForm.package_id || !purchaseForm.client_id) {
			toast.error('Select a package and client');
			return;
		}

		try {
			await billingService.createSubscription({
				client_id: Number(purchaseForm.client_id),
				project_id: purchaseForm.project_id
					? Number(purchaseForm.project_id)
					: undefined,
				package_id: Number(purchaseForm.package_id),
				create_hosting: purchaseForm.create_hosting,
				create_support: purchaseForm.create_support,
			});
			toast.success('Subscription created');
		} catch {
			toast.error('Failed to create subscription');
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
					<h1 className='text-2xl font-bold text-gray-900'>Hosting Packages</h1>
					<p className='text-gray-600'>
						Define resource limits and pricing tiers
					</p>
				</div>
				<div className='flex space-x-3'>
					<Button variant='outline' onClick={fetchPackages}>
						<RefreshCw className='w-4 h-4 mr-2' />
						Refresh
					</Button>
					<Button onClick={handleCreate}>
						<Plus className='w-4 h-4 mr-2' />
						Create Package
					</Button>
				</div>
			</div>

			<Card>
				<div className='space-y-4'>
					<div>
						<h2 className='text-lg font-semibold text-gray-900'>
							Manual Purchase
						</h2>
						<p className='text-sm text-gray-500'>
							Create a hosting/support subscription manually
						</p>
					</div>
					<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
						<div>
							<label className='block text-xs text-gray-500 mb-1'>
								Package
							</label>
							<select
								value={purchaseForm.package_id}
								onChange={e =>
									setPurchaseForm(prev => ({
										...prev,
										package_id: e.target.value,
									}))
								}
								className='w-full border rounded-md px-3 py-2 text-sm'
							>
								<option value=''>Select package</option>
								{packages.map(pkg => (
									<option key={pkg.id} value={pkg.id}>
										{pkg.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className='block text-xs text-gray-500 mb-1'>Client</label>
							<select
								value={purchaseForm.client_id}
								onChange={e =>
									setPurchaseForm(prev => ({
										...prev,
										client_id: e.target.value,
									}))
								}
								className='w-full border rounded-md px-3 py-2 text-sm'
							>
								<option value=''>Select client</option>
								{clients.map(client => (
									<option key={client.id} value={client.id}>
										{client.name || client.company_name || client.email}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className='block text-xs text-gray-500 mb-1'>
								Project (optional)
							</label>
							<select
								value={purchaseForm.project_id}
								onChange={e =>
									setPurchaseForm(prev => ({
										...prev,
										project_id: e.target.value,
									}))
								}
								className='w-full border rounded-md px-3 py-2 text-sm'
							>
								<option value=''>No project</option>
								{projects.map(project => (
									<option key={project.id} value={project.id}>
										{project.name || project.project_name}
									</option>
								))}
							</select>
						</div>
						<div className='flex flex-col justify-end'>
							<Button onClick={handleManualPurchase}>
								Create Subscription
							</Button>
						</div>
					</div>
					<div className='flex flex-wrap gap-4 text-sm text-gray-600'>
						<label className='flex items-center'>
							<input
								type='checkbox'
								className='mr-2'
								checked={purchaseForm.create_hosting}
								onChange={e =>
									setPurchaseForm(prev => ({
										...prev,
										create_hosting: e.target.checked,
									}))
								}
							/>
							Include hosting
						</label>
						<label className='flex items-center'>
							<input
								type='checkbox'
								className='mr-2'
								checked={purchaseForm.create_support}
								onChange={e =>
									setPurchaseForm(prev => ({
										...prev,
										create_support: e.target.checked,
									}))
								}
							/>
							Include support
						</label>
					</div>
				</div>
			</Card>

			{packages.length > 0 ? (
				<div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
					{packages.map(pkg => (
						<Card
							key={pkg.id}
							className='relative overflow-hidden hover:shadow-lg transition-shadow'
						>
							{!pkg.is_active && (
								<div className='absolute top-0 right-0 p-2'>
									<Badge className='bg-red-100 text-red-800'>Inactive</Badge>
								</div>
							)}
							<div className='p-6'>
								<div className='flex justify-between items-start mb-4'>
									<div>
										<h3 className='text-xl font-bold text-gray-900'>
											{pkg.name}
										</h3>
										<p className='text-sm text-gray-500 mt-1'>
											{pkg.description}
										</p>
									</div>
								</div>

								<div className='mb-6'>
									<div className='flex items-baseline'>
										<span className='text-3xl font-extrabold text-gray-900'>
											${pkg.price_monthly}
										</span>
										<span className='text-gray-500 ml-1'>/mo</span>
									</div>
									<div className='text-sm text-gray-500 mt-1'>
										or ${pkg.price_yearly}/yr
									</div>
								</div>

								<div className='space-y-3 mb-6'>
									<div className='flex items-center text-sm text-gray-600'>
										<HardDrive className='w-4 h-4 mr-3 text-gray-400' />
										{pkg.disk_quota_mb / 1024} GB Disk Space
									</div>
									<div className='flex items-center text-sm text-gray-600'>
										<Globe className='w-4 h-4 mr-3 text-gray-400' />
										{pkg.site_limit} Website{pkg.site_limit > 1 ? 's' : ''}
									</div>
									<div className='flex items-center text-sm text-gray-600'>
										<Database className='w-4 h-4 mr-3 text-gray-400' />
										{pkg.db_limit} Database{pkg.db_limit > 1 ? 's' : ''}
									</div>
									<div className='flex items-center text-sm text-gray-600'>
										<Server className='w-4 h-4 mr-3 text-gray-400' />
										{pkg.bandwidth_mb / 1024} GB Bandwidth
									</div>
								</div>

								<Button
									variant='outline'
									className='w-full'
									onClick={() => handleEdit(pkg)}
								>
									<Edit className='w-4 h-4 mr-2' />
									Edit Configuration
								</Button>
							</div>
						</Card>
					))}
				</div>
			) : (
				<Card>
					<div className='flex flex-col items-center justify-center py-16 text-gray-400'>
						<Server className='w-12 h-12 mb-3 text-gray-300' />
						<p className='text-sm font-medium'>No hosting packages</p>
						<p className='text-xs mt-1'>
							Create your first package using the button above
						</p>
					</div>
				</Card>
			)}

			{isEditorOpen && (
				<PackageEditor
					initialData={editingPackage}
					onSave={handleSave}
					onCancel={() => setIsEditorOpen(false)}
				/>
			)}
		</div>
	);
};

export default Packages;
