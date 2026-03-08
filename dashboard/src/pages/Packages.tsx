import React, { useState, useEffect } from 'react';
import {
	billingService,
	type CreateHostingPackagePayload,
	type HostingPackage,
	type UpdateHostingPackagePayload,
} from '../services/billing';
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

type PackageEditorPayload =
	| (CreateHostingPackagePayload & { id?: number })
	| (UpdateHostingPackagePayload & { id?: number });

const toSlug = (name: string) =>
	name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 100);

const parseFeatures = (raw?: string | string[] | null) => {
	if (!raw) {
		return [] as string[];
	}
	if (Array.isArray(raw)) {
		return raw.filter(
			(entry): entry is string =>
				typeof entry === 'string' && entry.trim().length > 0,
		);
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed)) {
			return parsed.filter(
				(entry): entry is string =>
					typeof entry === 'string' && entry.trim().length > 0,
			);
		}
	} catch {
		// ignore non-json values
	}
	return raw
		.split(/[\n,]/)
		.map(feature => feature.trim())
		.filter(Boolean);
};

const Packages: React.FC = () => {
	const [packages, setPackages] = useState<HostingPackage[]>([]);
	const [loading, setLoading] = useState(true);
	const [isEditorOpen, setIsEditorOpen] = useState(false);
	const [editingPackage, setEditingPackage] = useState<
		HostingPackage | undefined
	>(undefined);
	const [clients, setClients] = useState<any[]>([]);
	const [projects, setProjects] = useState<any[]>([]);
	const [purchaseForm, setPurchaseForm] = useState({
		hosting_package_id: '',
		support_package_id: '',
		client_id: '',
		project_id: '',
		create_hosting: true,
		create_support: true,
	});

	const hostingPackages = packages.filter(
		pkg => pkg.package_type === 'hosting',
	);
	const supportPackages = packages.filter(
		pkg => pkg.package_type === 'support',
	);

	const renderPackageDetails = (pkg: HostingPackage) => {
		if (pkg.package_type === 'support') {
			const features = parseFeatures(pkg.features).slice(0, 4);
			return (
				<div className='space-y-3 mb-6'>
					<div className='flex items-center text-sm text-gray-600'>
						<Server className='w-4 h-4 mr-3 text-gray-400' />
						Support plan for ongoing maintenance
					</div>
					<div className='flex items-center text-sm text-gray-600'>
						<Database className='w-4 h-4 mr-3 text-gray-400' />
						Dedicated support pricing and SLA tracking
					</div>
					{features.length > 0 ? (
						features.map(feature => (
							<div
								key={`${pkg.id}-${feature}`}
								className='flex items-center text-sm text-gray-600'
							>
								<Globe className='w-4 h-4 mr-3 text-gray-400' />
								{feature}
							</div>
						))
					) : (
						<div className='flex items-center text-sm text-gray-600'>
							<Globe className='w-4 h-4 mr-3 text-gray-400' />
							Proactive updates, monitoring, and support
						</div>
					)}
				</div>
			);
		}

		return (
			<div className='space-y-3 mb-6'>
				<div className='flex items-center text-sm text-gray-600'>
					<HardDrive className='w-4 h-4 mr-3 text-gray-400' />
					{pkg.disk_space_gb} GB Disk Space
				</div>
				<div className='flex items-center text-sm text-gray-600'>
					<Globe className='w-4 h-4 mr-3 text-gray-400' />
					{pkg.domains_limit} Domain
					{pkg.domains_limit !== 1 ? 's' : ''}
				</div>
				<div className='flex items-center text-sm text-gray-600'>
					<Database className='w-4 h-4 mr-3 text-gray-400' />
					{pkg.databases_limit} Database
					{pkg.databases_limit !== 1 ? 's' : ''}
				</div>
				<div className='flex items-center text-sm text-gray-600'>
					<Server className='w-4 h-4 mr-3 text-gray-400' />
					{pkg.bandwidth_gb} GB Bandwidth
				</div>
			</div>
		);
	};

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

	const handleEdit = (pkg: HostingPackage) => {
		setEditingPackage(pkg);
		setIsEditorOpen(true);
	};

	const handleCreate = () => {
		setEditingPackage(undefined);
		setIsEditorOpen(true);
	};

	const handleSave = async (data: PackageEditorPayload) => {
		try {
			if (typeof data.id === 'number') {
				const { id, ...updatePayload } = data;
				await billingService.updatePackage(id, updatePayload);
				toast.success('Package updated');
			} else {
				const name = typeof data.name === 'string' ? data.name.trim() : '';
				const slug = toSlug(name);
				if (!slug) {
					toast.error('Package name must contain letters or numbers');
					return;
				}
				const createPayload: CreateHostingPackagePayload = {
					package_type: data.package_type,
					name,
					slug,
					description: data.description,
					disk_space_gb: data.disk_space_gb,
					bandwidth_gb: data.bandwidth_gb,
					domains_limit: data.domains_limit,
					databases_limit: data.databases_limit,
					email_accounts_limit: data.email_accounts_limit,
					monthly_price: data.monthly_price,
					quarterly_price: data.quarterly_price,
					yearly_price: data.yearly_price,
					biennial_price: data.biennial_price,
					setup_fee: data.setup_fee,
					currency: data.currency,
					hosting_yearly_price: data.hosting_yearly_price,
					support_monthly_price: data.support_monthly_price,
					features: data.features,
					is_featured: data.is_featured,
				};
				await billingService.createPackage({
					...createPayload,
				});
				toast.success('Package created');
			}
			setIsEditorOpen(false);
			fetchPackages();
		} catch {
			toast.error('Failed to save package');
		}
	};

	const handleManualPurchase = async () => {
		if (!purchaseForm.client_id) {
			toast.error('Select a client');
			return;
		}
		if (!purchaseForm.create_hosting && !purchaseForm.create_support) {
			toast.error('Choose at least one service');
			return;
		}
		if (purchaseForm.create_hosting && !purchaseForm.hosting_package_id) {
			toast.error('Select a hosting package');
			return;
		}
		if (purchaseForm.create_support && !purchaseForm.support_package_id) {
			toast.error('Select a support package');
			return;
		}

		try {
			await billingService.createSubscription({
				client_id: Number(purchaseForm.client_id),
				project_id: purchaseForm.project_id
					? Number(purchaseForm.project_id)
					: undefined,
				hosting_package_id: purchaseForm.hosting_package_id
					? Number(purchaseForm.hosting_package_id)
					: undefined,
				support_package_id: purchaseForm.support_package_id
					? Number(purchaseForm.support_package_id)
					: undefined,
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
					<h1 className='text-2xl font-bold text-gray-900'>
						Hosting & Support Packages
					</h1>
					<p className='text-gray-600'>
						Define separate service packages and pricing tiers
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
					<div className='grid grid-cols-1 md:grid-cols-5 gap-4'>
						<div>
							<label className='block text-xs text-gray-500 mb-1'>
								Hosting Package
							</label>
							<select
								value={purchaseForm.hosting_package_id}
								onChange={e =>
									setPurchaseForm(prev => ({
										...prev,
										hosting_package_id: e.target.value,
									}))
								}
								disabled={!purchaseForm.create_hosting}
								className='w-full border rounded-md px-3 py-2 text-sm'
							>
								<option value=''>Select hosting package</option>
								{hostingPackages.map(pkg => (
									<option key={pkg.id} value={pkg.id}>
										{pkg.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className='block text-xs text-gray-500 mb-1'>
								Support Package
							</label>
							<select
								value={purchaseForm.support_package_id}
								onChange={e =>
									setPurchaseForm(prev => ({
										...prev,
										support_package_id: e.target.value,
									}))
								}
								disabled={!purchaseForm.create_support}
								className='w-full border rounded-md px-3 py-2 text-sm'
							>
								<option value=''>Select support package</option>
								{supportPackages.map(pkg => (
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
										<p className='text-xs uppercase tracking-wide text-gray-400 mt-1'>
											{pkg.package_type}
										</p>
										<p className='text-sm text-gray-500 mt-1'>
											{pkg.description}
										</p>
									</div>
								</div>

								<div className='mb-6'>
									<div className='flex items-baseline'>
										<span className='text-3xl font-extrabold text-gray-900'>
											${pkg.monthly_price}
										</span>
										<span className='text-gray-500 ml-1'>/mo</span>
									</div>
									<div className='text-sm text-gray-500 mt-1'>
										or ${pkg.yearly_price}/yr
									</div>
								</div>

								{renderPackageDetails(pkg)}

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
