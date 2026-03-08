import React from 'react';
import Button from '../ui/Button';
import { X } from 'lucide-react';
import type {
	CreateHostingPackagePayload,
	HostingPackage,
	UpdateHostingPackagePayload,
} from '../../services/billing';

type PackageEditorPayload =
	| (CreateHostingPackagePayload & { id?: number })
	| (UpdateHostingPackagePayload & { id?: number });

interface PackageEditorProps {
	initialData?: HostingPackage;
	onSave: (data: PackageEditorPayload) => void;
	onCancel: () => void;
}

type FormData = {
	package_type: 'hosting' | 'support';
	name: string;
	description: string;
	disk_space_gb: number;
	bandwidth_gb: number;
	domains_limit: number;
	databases_limit: number;
	email_accounts_limit: number;
	monthly_price: number;
	quarterly_price: number;
	yearly_price: number;
	biennial_price: number;
	hosting_yearly_price: number;
	support_monthly_price: number;
	features: string;
	is_active: boolean;
	is_featured: boolean;
};

const defaultFormData: FormData = {
	package_type: 'hosting',
	name: '',
	description: '',
	disk_space_gb: 10,
	bandwidth_gb: 100,
	domains_limit: 1,
	databases_limit: 1,
	email_accounts_limit: 5,
	monthly_price: 10,
	quarterly_price: 27,
	yearly_price: 99,
	biennial_price: 189,
	hosting_yearly_price: 99,
	support_monthly_price: 0,
	features: '',
	is_active: true,
	is_featured: false,
};

const PackageEditor: React.FC<PackageEditorProps> = ({
	initialData,
	onSave,
	onCancel,
}) => {
	const [formData, setFormData] = React.useState<FormData>(
		initialData
			? {
					package_type: initialData.package_type || 'hosting',
					name: initialData.name,
					description: initialData.description || '',
					disk_space_gb: initialData.disk_space_gb,
					bandwidth_gb: initialData.bandwidth_gb,
					domains_limit: initialData.domains_limit,
					databases_limit: initialData.databases_limit,
					email_accounts_limit: initialData.email_accounts_limit,
					monthly_price: initialData.monthly_price,
					quarterly_price: initialData.quarterly_price,
					yearly_price: initialData.yearly_price,
					biennial_price: initialData.biennial_price,
					hosting_yearly_price: initialData.hosting_yearly_price,
					support_monthly_price: initialData.support_monthly_price,
					features: initialData.features.join(', '),
					is_active: initialData.is_active,
					is_featured: initialData.is_featured,
				}
			: defaultFormData,
	);

	const handleChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>,
	) => {
		const { name, value, type } = e.target;
		setFormData(prev => ({
			...prev,
			[name]: type === 'number' ? Number(value) : value,
		}));
	};

	const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }));
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const features = formData.features
			.split(',')
			.map(entry => entry.trim())
			.filter(Boolean);
		const payloadBase = {
			package_type: formData.package_type,
			name: formData.name.trim(),
			description: formData.description.trim() || undefined,
			disk_space_gb: formData.disk_space_gb,
			bandwidth_gb: formData.bandwidth_gb,
			domains_limit: formData.domains_limit,
			databases_limit: formData.databases_limit,
			email_accounts_limit: formData.email_accounts_limit,
			monthly_price: formData.monthly_price,
			quarterly_price: formData.quarterly_price,
			yearly_price: formData.yearly_price,
			biennial_price: formData.biennial_price,
			hosting_yearly_price: formData.hosting_yearly_price,
			support_monthly_price: formData.support_monthly_price,
			features,
			is_featured: formData.is_featured,
		};

		if (initialData?.id) {
			onSave({
				id: initialData.id,
				...payloadBase,
				is_active: formData.is_active,
			});
			return;
		}

		onSave(payloadBase);
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto'>
				<div className='flex justify-between items-center mb-6'>
					<h2 className='text-xl font-bold'>
						{initialData ? 'Edit Package' : 'New Package'}
					</h2>
					<button
						onClick={onCancel}
						className='text-gray-500 hover:text-gray-700'
					>
						<X className='w-6 h-6' />
					</button>
				</div>

				<form onSubmit={handleSubmit} className='space-y-4'>
					<div>
						<label className='block text-sm font-medium text-gray-700'>
							Package Name
						</label>
						<input
							type='text'
							name='name'
							required
							value={formData.name}
							onChange={handleChange}
							className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700'>
							Description
						</label>
						<textarea
							name='description'
							value={formData.description}
							onChange={handleChange}
							rows={2}
							className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700'>
							Service Type
						</label>
						<select
							name='package_type'
							value={formData.package_type}
							onChange={handleChange}
							className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
						>
							<option value='hosting'>Hosting</option>
							<option value='support'>Support</option>
						</select>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Monthly Price ($)
							</label>
							<input
								type='number'
								name='monthly_price'
								step='0.01'
								min='0'
								value={formData.monthly_price}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Yearly Price ($)
							</label>
							<input
								type='number'
								name='yearly_price'
								step='0.01'
								min='0'
								value={formData.yearly_price}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Quarterly Price ($)
							</label>
							<input
								type='number'
								name='quarterly_price'
								step='0.01'
								min='0'
								value={formData.quarterly_price}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Biennial Price ($)
							</label>
							<input
								type='number'
								name='biennial_price'
								step='0.01'
								min='0'
								value={formData.biennial_price}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
					</div>

					<div className='grid grid-cols-3 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Disk (GB)
							</label>
							<input
								type='number'
								name='disk_space_gb'
								min='0'
								value={formData.disk_space_gb}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Bandwidth (GB)
							</label>
							<input
								type='number'
								name='bandwidth_gb'
								min='0'
								value={formData.bandwidth_gb}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Domains
							</label>
							<input
								type='number'
								name='domains_limit'
								min='0'
								value={formData.domains_limit}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
					</div>

					<div className='grid grid-cols-3 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Databases
							</label>
							<input
								type='number'
								name='databases_limit'
								min='0'
								value={formData.databases_limit}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Email Accounts
							</label>
							<input
								type='number'
								name='email_accounts_limit'
								min='0'
								value={formData.email_accounts_limit}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700'>
								Support / Month ($)
							</label>
							<input
								type='number'
								name='support_monthly_price'
								step='0.01'
								min='0'
								value={formData.support_monthly_price}
								onChange={handleChange}
								className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700'>
							Features (comma-separated)
						</label>
						<textarea
							name='features'
							value={formData.features}
							onChange={handleChange}
							rows={2}
							className='mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500'
						/>
					</div>

					<div className='flex items-center gap-6'>
						<label className='flex items-center text-sm text-gray-900'>
							<input
								name='is_active'
								type='checkbox'
								checked={formData.is_active}
								onChange={handleCheckboxChange}
								className='h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2'
							/>
							Active package
						</label>
						<label className='flex items-center text-sm text-gray-900'>
							<input
								name='is_featured'
								type='checkbox'
								checked={formData.is_featured}
								onChange={handleCheckboxChange}
								className='h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-2'
							/>
							Featured package
						</label>
					</div>

					<div className='mt-6 flex justify-end space-x-3'>
						<Button variant='outline' onClick={onCancel} type='button'>
							Cancel
						</Button>
						<Button type='submit'>Save Package</Button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default PackageEditor;
