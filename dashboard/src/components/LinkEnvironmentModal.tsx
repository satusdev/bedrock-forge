import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	X,
	Server,
	Database,
	Globe,
	Loader2,
	User,
	Eye,
	EyeOff,
	Search,
	FolderTree,
	Check,
	RefreshCw,
	HardDrive,
	FileCode,
	AlertCircle,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { dashboardApi } from '@/services/api';
import toast from 'react-hot-toast';
import GoogleDriveFolderPicker from './GoogleDriveFolderPicker';

interface Server {
	id: number;
	name: string;
	hostname: string;
	status: string;
}

interface ScannedSite {
	path: string;
	wp_path: string;
	is_bedrock: boolean;
	site_url: string;
	site_name: string;
	wp_version: string;
	domain: string;
	imported: boolean;
}

interface LinkEnvironmentModalProps {
	projectId: number;
	projectName: string;
	isOpen: boolean;
	onClose: () => void;
	existingEnvironments: string[];
}

export default function LinkEnvironmentModal({
	projectId,
	projectName,
	isOpen,
	onClose,
	existingEnvironments,
}: LinkEnvironmentModalProps) {
	const queryClient = useQueryClient();

	const [formData, setFormData] = useState({
		environment: 'staging' as 'staging' | 'production' | 'development',
		server_id: null as number | null,
		wp_url: '',
		wp_path: '',
		database_name: '',
		database_user: '',
		database_password: '',
		backup_path: '',
		backup_folder_id: '',
		backup_folder_name: '',
		notes: '',
		// WP Admin credentials
		wp_admin_username: '',
		wp_admin_password: '',
		wp_admin_email: '',
	});
	const [showWpPassword, setShowWpPassword] = useState(false);

	// Scan state
	const [scanning, setScanning] = useState(false);
	const [scannedSites, setScannedSites] = useState<ScannedSite[]>([]);
	const [selectedSite, setSelectedSite] = useState<ScannedSite | null>(null);
	const [fetchingEnv, setFetchingEnv] = useState(false);
	const [showDrivePicker, setShowDrivePicker] = useState(false);

	// Fetch servers
	const { data: serversData } = useQuery({
		queryKey: ['servers'],
		queryFn: dashboardApi.getServers,
		enabled: isOpen,
	});
	const servers = (serversData?.data || []) as Server[];

	// Link mutation
	const linkMutation = useMutation({
		mutationFn: (data: any) => dashboardApi.linkEnvironment(projectId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['project-environments', projectId],
			});
			toast.success('Environment linked successfully!');
			onClose();
			resetForm();
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to link environment');
		},
	});

	const resetForm = () => {
		setFormData({
			environment: 'staging',
			server_id: null,
			wp_url: '',
			wp_path: '',
			database_name: '',
			database_user: '',
			database_password: '',
			backup_path: '',
			backup_folder_id: '',
			backup_folder_name: '',
			notes: '',
			wp_admin_username: '',
			wp_admin_password: '',
			wp_admin_email: '',
		});
		setShowWpPassword(false);
		setScannedSites([]);
		setSelectedSite(null);
	};

	// Scan server for WordPress sites
	const handleScanServer = async () => {
		if (!formData.server_id) {
			toast.error('Please select a server first');
			return;
		}

		setScanning(true);
		setScannedSites([]);
		setSelectedSite(null);

		try {
			const response = await dashboardApi.scanServerSites(formData.server_id);
			if (response.data?.success) {
				const sites = response.data.sites || [];
				setScannedSites(sites);
				if (sites.length === 0) {
					toast('No WordPress sites found on server', { icon: '📂' });
				} else {
					toast.success(`Found ${sites.length} WordPress site(s)`);
				}
			} else {
				toast.error(response.data?.message || 'Scan failed');
			}
		} catch (error: any) {
			console.error('Scan error:', error);
			toast.error(error.response?.data?.detail || 'Failed to scan server');
		} finally {
			setScanning(false);
		}
	};

	// Select a scanned site and populate form
	const handleSelectSite = (site: ScannedSite) => {
		setSelectedSite(site);
		setFormData(prev => ({
			...prev,
			wp_url: site.site_url || `https://${site.domain}`,
			wp_path: site.path,
			// Auto-detect environment from path or domain
			environment:
				site.domain?.includes('staging') || site.path?.includes('staging')
					? 'staging'
					: site.domain?.includes('dev') || site.path?.includes('dev')
					? 'development'
					: prev.environment,
		}));
	};

	// Fetch .env credentials from Bedrock site
	const handleFetchEnv = async () => {
		if (!formData.server_id || !selectedSite) {
			toast.error('Please select a site first');
			return;
		}

		if (!selectedSite.is_bedrock) {
			toast.error(
				'This site is not a Bedrock installation. Cannot auto-fetch credentials.'
			);
			return;
		}

		setFetchingEnv(true);
		try {
			const response = await dashboardApi.readServerEnv(
				formData.server_id,
				selectedSite.path
			);
			if (response.data?.success && response.data.env) {
				const env = response.data.env;
				setFormData(prev => ({
					...prev,
					database_name: env.db_name || prev.database_name,
					database_user: env.db_user || prev.database_user,
					database_password: env.db_password || prev.database_password,
					wp_url: env.wp_home || env.wp_siteurl || prev.wp_url,
				}));
				toast.success('Credentials loaded from .env file');
			}
		} catch (error: any) {
			console.error('Fetch env error:', error);
			toast.error(error.response?.data?.detail || 'Failed to read .env file');
		} finally {
			setFetchingEnv(false);
		}
	};

	// Handle Google Drive folder selection
	const handleDriveFolderSelect = (
		folderId: string,
		folderName: string,
		path: string
	) => {
		setFormData(prev => ({
			...prev,
			backup_path: path,
			backup_folder_id: folderId,
			backup_folder_name: folderName,
		}));
		setShowDrivePicker(false);
		toast.success(`Selected folder: ${folderName}`);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData.server_id) {
			toast.error('Please select a server');
			return;
		}
		linkMutation.mutate(formData);
	};

	const updateForm = (field: string, value: any) => {
		setFormData(prev => ({ ...prev, [field]: value }));
	};

	const availableEnvironments = ['staging', 'production', 'development'].filter(
		env => !existingEnvironments.includes(env)
	);

	if (!isOpen) return null;

	return (
		<div className='fixed inset-0 z-50 overflow-y-auto'>
			<div className='flex items-center justify-center min-h-screen px-4'>
				{/* Backdrop */}
				<div
					className='fixed inset-0 bg-black/50 transition-opacity'
					onClick={onClose}
				/>

				{/* Modal */}
				<div className='relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto'>
					{/* Header */}
					<div className='sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between'>
						<div>
							<h2 className='text-xl font-bold text-gray-900'>
								Link Environment
							</h2>
							<p className='text-sm text-gray-500'>
								Add server deployment for {projectName}
							</p>
						</div>
						<button
							onClick={onClose}
							className='p-2 hover:bg-gray-100 rounded-lg'
						>
							<X className='w-5 h-5' />
						</button>
					</div>

					{/* Form */}
					<form onSubmit={handleSubmit} className='p-6 space-y-6'>
						{/* Environment Type */}
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-2'>
								Environment Type *
							</label>
							<div className='grid grid-cols-3 gap-3'>
								{availableEnvironments.map(env => (
									<button
										key={env}
										type='button'
										onClick={() => updateForm('environment', env)}
										className={`p-3 border rounded-lg text-center capitalize transition-all ${
											formData.environment === env
												? env === 'production'
													? 'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-500'
													: env === 'staging'
													? 'border-yellow-500 bg-yellow-50 text-yellow-700 ring-2 ring-yellow-500'
													: 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500'
												: 'border-gray-200 hover:border-gray-300'
										}`}
									>
										{env === 'production' && '🟢 '}
										{env === 'staging' && '🟡 '}
										{env === 'development' && '🔵 '}
										{env}
									</button>
								))}
							</div>
							{availableEnvironments.length === 0 && (
								<p className='text-sm text-yellow-600 mt-2'>
									All environments are already linked to this project.
								</p>
							)}
						</div>

						{/* Server Selection */}
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-2'>
								<Server className='w-4 h-4 inline mr-1' />
								Server *
							</label>
							<div className='grid grid-cols-2 gap-3'>
								{servers.map(server => (
									<button
										key={server.id}
										type='button'
										onClick={() => {
											updateForm('server_id', server.id);
											setScannedSites([]);
											setSelectedSite(null);
										}}
										className={`p-3 border rounded-lg text-left transition-all ${
											formData.server_id === server.id
												? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500'
												: 'border-gray-200 hover:border-gray-300'
										}`}
									>
										<div className='font-medium'>{server.name}</div>
										<div className='text-xs text-gray-500'>
											{server.hostname}
										</div>
									</button>
								))}
							</div>
							{servers.length === 0 && (
								<p className='text-sm text-gray-500'>
									No servers available.{' '}
									<a href='/servers' className='text-primary-600 underline'>
										Add a server
									</a>{' '}
									first.
								</p>
							)}

							{/* Scan Button */}
							{formData.server_id && (
								<button
									type='button'
									onClick={handleScanServer}
									disabled={scanning}
									className='mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50'
								>
									{scanning ? (
										<>
											<Loader2 className='w-4 h-4 animate-spin' />
											Scanning server...
										</>
									) : (
										<>
											<Search className='w-4 h-4' />
											Scan Server for WordPress Sites
										</>
									)}
								</button>
							)}
						</div>

						{/* Scanned Sites Selection */}
						{scannedSites.length > 0 && (
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-2'>
									<FolderTree className='w-4 h-4 inline mr-1' />
									Select a Site ({scannedSites.length} found)
								</label>
								<div className='grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2'>
									{scannedSites.map((site, index) => (
										<button
											key={index}
											type='button'
											onClick={() => handleSelectSite(site)}
											className={`p-3 border rounded-lg text-left transition-all ${
												selectedSite?.path === site.path
													? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500'
													: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
											}`}
										>
											<div className='flex items-center justify-between'>
												<div className='flex items-center gap-2'>
													{selectedSite?.path === site.path && (
														<Check className='w-4 h-4 text-primary-600' />
													)}
													<span className='font-medium text-gray-900'>
														{site.site_name || site.domain || 'Unknown Site'}
													</span>
													{site.is_bedrock && (
														<span className='px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full'>
															Bedrock
														</span>
													)}
													{site.imported && (
														<span className='px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full'>
															Already Imported
														</span>
													)}
												</div>
												{site.wp_version && (
													<span className='text-xs text-gray-500'>
														WP {site.wp_version}
													</span>
												)}
											</div>
											<div className='text-xs text-gray-500 mt-1'>
												{site.site_url || site.domain}
											</div>
											<div className='text-xs text-gray-400 font-mono mt-0.5'>
												{site.path}
											</div>
										</button>
									))}
								</div>

								{/* Fetch .env button for Bedrock sites */}
								{selectedSite?.is_bedrock && (
									<button
										type='button'
										onClick={handleFetchEnv}
										disabled={fetchingEnv}
										className='mt-2 flex items-center gap-2 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm transition-colors disabled:opacity-50'
									>
										{fetchingEnv ? (
											<>
												<Loader2 className='w-4 h-4 animate-spin' />
												Reading .env file...
											</>
										) : (
											<>
												<FileCode className='w-4 h-4' />
												Fetch Credentials from .env
											</>
										)}
									</button>
								)}

								{selectedSite && !selectedSite.is_bedrock && (
									<div className='mt-2 flex items-center gap-2 text-sm text-yellow-600'>
										<AlertCircle className='w-4 h-4' />
										Standard WordPress - please enter database credentials
										manually
									</div>
								)}
							</div>
						)}

						{/* WordPress Info */}
						<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									<Globe className='w-4 h-4 inline mr-1' />
									Site URL *
								</label>
								<input
									type='text'
									value={formData.wp_url}
									onChange={e => updateForm('wp_url', e.target.value)}
									placeholder='https://staging.example.com'
									required
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
								/>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									WordPress Path *
								</label>
								<input
									type='text'
									value={formData.wp_path}
									onChange={e => updateForm('wp_path', e.target.value)}
									placeholder='/home/user/public_html'
									required
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
								/>
							</div>
						</div>

						{/* Database */}
						<div>
							<h3 className='text-sm font-medium text-gray-700 mb-3 flex items-center'>
								<Database className='w-4 h-4 mr-1' />
								Database Credentials
							</h3>
							<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Database Name *
									</label>
									<input
										type='text'
										value={formData.database_name}
										onChange={e => updateForm('database_name', e.target.value)}
										placeholder='wp_database'
										required
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
									/>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Database User *
									</label>
									<input
										type='text'
										value={formData.database_user}
										onChange={e => updateForm('database_user', e.target.value)}
										placeholder='wp_user'
										required
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
									/>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Password *
									</label>
									<input
										type='password'
										value={formData.database_password}
										onChange={e =>
											updateForm('database_password', e.target.value)
										}
										placeholder='••••••••'
										required
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
									/>
								</div>
							</div>
						</div>

						{/* WordPress Admin Credentials */}
						<div>
							<h3 className='text-sm font-medium text-gray-700 mb-3 flex items-center'>
								<User className='w-4 h-4 mr-1' />
								WordPress Admin (for auto-login)
							</h3>
							<p className='text-xs text-gray-500 mb-3'>
								Optional. Save admin credentials for quick WP dashboard access.
							</p>
							<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Admin Username
									</label>
									<input
										type='text'
										value={formData.wp_admin_username}
										onChange={e =>
											updateForm('wp_admin_username', e.target.value)
										}
										placeholder='admin'
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
									/>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Admin Password
									</label>
									<div className='relative'>
										<input
											type={showWpPassword ? 'text' : 'password'}
											value={formData.wp_admin_password}
											onChange={e =>
												updateForm('wp_admin_password', e.target.value)
											}
											placeholder='••••••••'
											className='w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
										/>
										<button
											type='button'
											onClick={() => setShowWpPassword(!showWpPassword)}
											className='absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600'
										>
											{showWpPassword ? (
												<EyeOff className='w-4 h-4' />
											) : (
												<Eye className='w-4 h-4' />
											)}
										</button>
									</div>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Admin Email
									</label>
									<input
										type='email'
										value={formData.wp_admin_email}
										onChange={e => updateForm('wp_admin_email', e.target.value)}
										placeholder='admin@example.com'
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
									/>
								</div>
							</div>
						</div>

						{/* Optional */}
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								<HardDrive className='w-4 h-4 inline mr-1' />
								Backup Location (optional)
							</label>
							<div className='flex gap-2'>
								<input
									type='text'
									value={formData.backup_folder_name || formData.backup_path}
									onChange={e => updateForm('backup_path', e.target.value)}
									placeholder='Select Google Drive folder or enter path'
									className='flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-gray-50'
									readOnly={!!formData.backup_folder_id}
								/>
								<button
									type='button'
									onClick={() => setShowDrivePicker(true)}
									className='px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors flex items-center gap-2'
								>
									<HardDrive className='w-4 h-4' />
									Browse Drive
								</button>
								{formData.backup_folder_id && (
									<button
										type='button'
										onClick={() => {
											setFormData(prev => ({
												...prev,
												backup_path: '',
												backup_folder_id: '',
												backup_folder_name: '',
											}));
										}}
										className='px-3 py-2 text-gray-500 hover:text-gray-700'
										title='Clear selection'
									>
										<X className='w-4 h-4' />
									</button>
								)}
							</div>
							{formData.backup_folder_id && (
								<p className='text-xs text-green-600 mt-1'>
									✓ Google Drive folder selected: {formData.backup_path}
								</p>
							)}
						</div>

						{/* Google Drive Folder Picker Modal */}
						{showDrivePicker && (
							<div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50'>
								<GoogleDriveFolderPicker
									onSelect={handleDriveFolderSelect}
									onCancel={() => setShowDrivePicker(false)}
									initialFolderId={formData.backup_folder_id || undefined}
								/>
							</div>
						)}

						{/* Notes */}
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								Notes (optional)
							</label>
							<textarea
								value={formData.notes}
								onChange={e => updateForm('notes', e.target.value)}
								placeholder='Any additional notes...'
								rows={2}
								className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
							/>
						</div>

						{/* Actions */}
						<div className='flex justify-end space-x-3 pt-4 border-t'>
							<Button type='button' variant='secondary' onClick={onClose}>
								Cancel
							</Button>
							<Button
								type='submit'
								variant='primary'
								disabled={
									linkMutation.isPending ||
									!formData.server_id ||
									availableEnvironments.length === 0
								}
							>
								{linkMutation.isPending ? (
									<>
										<Loader2 className='w-4 h-4 mr-2 animate-spin' />
										Linking...
									</>
								) : (
									'Link Environment'
								)}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
