/**
 * Servers Management Page
 * CRUD for user's servers with SSH connection testing.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Server,
	Plus,
	Search,
	CheckCircle,
	XCircle,
	AlertTriangle,
	RefreshCw,
	Trash2,
	Edit3,
	Zap,
	Clock,
	Tag,
	X,
	ExternalLink,
	FolderSearch,
	Globe,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import api, { dashboardApi } from '../services/api';
import toast from 'react-hot-toast';

interface ServerData {
	id: number;
	name: string;
	hostname: string;
	provider: string;
	status: string;
	ssh_user: string;
	ssh_port: number;
	panel_type: string;
	panel_url?: string;
	panel_username?: string;
	panel_password?: string;
	panel_verified?: boolean;
	last_health_check: string | null;
	tags?: string[];
	wp_root_paths?: string[];
}

interface CreateServerForm {
	name: string;
	hostname: string;
	provider: string;
	ssh_user: string;
	ssh_port: number;
	ssh_key_path: string;
	ssh_password?: string;
	ssh_private_key?: string;
	panel_type: string;
	panel_url: string;
	panel_username?: string;
	panel_password?: string;
}

interface ScannedSite {
	path: string;
	wp_path: string;
	is_bedrock: boolean;
	site_url: string | null;
	site_name: string | null;
	wp_version: string | null;
	domain: string | null;
	imported: boolean;
}

interface ScanResult {
	success: boolean;
	message: string;
	sites: ScannedSite[];
	server_id: number;
	server_name: string;
}

export default function Servers() {
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showScanModal, setShowScanModal] = useState(false);
	const [scanningServer, setScanningServer] = useState<ServerData | null>(null);
	const [scanResults, setScanResults] = useState<ScanResult | null>(null);
	const [scanBasePath, setScanBasePath] = useState('/home');
	const [editingServer, setEditingServer] = useState<ServerData | null>(null);
	const [serverToDelete, setServerToDelete] = useState<ServerData | null>(null);
	const [deleteConfirmText, setDeleteConfirmText] = useState('');
	const [formData, setFormData] = useState<CreateServerForm>({
		name: '',
		hostname: '',
		provider: 'custom',
		ssh_user: 'root',
		ssh_port: 22,
		ssh_key_path: '',
		ssh_password: '',
		ssh_private_key: '',
		panel_type: 'none',
		panel_url: '',
		panel_username: '',
		panel_password: '',
	});
	const queryClient = useQueryClient();

	// Fetch servers
	const { data: serversData, isLoading } = useQuery({
		queryKey: ['servers'],
		queryFn: () => api.get<ServerData[]>('/servers'),
	});

	const servers = serversData?.data || [];

	// Fetch all available tags
	const { data: tagsData } = useQuery({
		queryKey: ['server-tags'],
		queryFn: () => api.get<{ tags: string[] }>('/servers/tags/all'),
	});

	const allTags = tagsData?.data?.tags || [];

	// Create server mutation
	const createMutation = useMutation({
		mutationFn: (data: CreateServerForm) => api.post('/servers', data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['servers'] });
			setShowCreateModal(false);
			setFormData({
				name: '',
				hostname: '',
				provider: 'custom',
				ssh_user: 'root',
				ssh_port: 22,
				ssh_key_path: '',
				ssh_password: '',
				ssh_private_key: '',
				panel_type: 'none',
				panel_url: '',
				panel_username: '',
				panel_password: '',
			});
			toast.success('Server added successfully');
		},
		onError: () => toast.error('Failed to add server'),
	});

	// Delete server mutation
	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/servers/${id}`),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['servers'] });
			setShowDeleteModal(false);
			setServerToDelete(null);
			setDeleteConfirmText('');
			toast.success('Server removed');
		},
		onError: () => toast.error('Failed to remove server'),
	});

	// Update server mutation
	const updateMutation = useMutation({
		mutationFn: (data: { id: number } & Partial<CreateServerForm>) =>
			api.put(`/servers/${data.id}`, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['servers'] });
			setShowEditModal(false);
			setEditingServer(null);
			toast.success('Server updated');
		},
		onError: () => toast.error('Failed to update server'),
	});

	// Test connection mutation
	const testMutation = useMutation({
		mutationFn: (id: number) =>
			api.post<{ success: boolean; message: string }>(`/servers/${id}/test`),
		onSuccess: (data: any) => {
			queryClient.invalidateQueries({ queryKey: ['servers'] });
			if (data.data.success) {
				toast.success(data.data.message);
			} else {
				toast.error(data.data.message);
			}
		},
		onError: () => toast.error('Connection test failed'),
	});

	// Verify Panel mutation
	const verifyPanelMutation = useMutation({
		mutationFn: (id: number) => dashboardApi.verifyCyberPanel(id),
		onSuccess: (response: any) => {
			queryClient.invalidateQueries({ queryKey: ['servers'] });
			if (response.data.verified) {
				toast.success('Panel connection verified');
			} else {
				toast.error('Panel connection failed');
			}
		},
		onError: () => toast.error('Verification request failed'),
	});

	// Scan sites mutation
	const scanSitesMutation = useMutation({
		mutationFn: ({ id, basePath }: { id: number; basePath: string }) =>
			api.post<ScanResult>(
				`/servers/${id}/scan-sites?base_path=${encodeURIComponent(
					basePath
				)}&max_depth=4`
			),
		onSuccess: (response: any) => {
			setScanResults(response.data);
			if (response.data.success) {
				toast.success(response.data.message);
			} else {
				toast.error(response.data.message);
			}
		},
		onError: () => toast.error('Failed to scan server'),
	});

	// Get panel session URL
	const getPanelLoginMutation = useMutation({
		mutationFn: async (id: number) => {
			try {
				return await api.post(`/servers/${id}/panel/session-url`);
			} catch (error: any) {
				return await api.get(`/servers/${id}/panel/login-url`);
			}
		},
		onSuccess: (response: any) => {
			const data = response.data;
			const targetUrl = data.session_url || data.panel_url;
			window.open(targetUrl, '_blank');
			if (data.username) {
				toast.success(`Panel opened. User: ${data.username}`, {
					duration: 5000,
				});
			}
		},
		onError: (error: any) => {
			const message =
				error?.response?.data?.detail || 'Failed to get panel login';
			toast.error(message);
		},
	});

	const filteredServers = servers.filter(s => {
		const matchesSearch =
			s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			s.hostname.toLowerCase().includes(searchQuery.toLowerCase());

		const matchesTags =
			selectedTags.length === 0 ||
			selectedTags.some(tag => s.tags?.includes(tag));

		return matchesSearch && matchesTags;
	});

	const toggleTag = (tag: string) => {
		setSelectedTags(prev =>
			prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
		);
	};

	const clearTags = () => setSelectedTags([]);

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'online':
				return <CheckCircle className='w-5 h-5 text-green-500' />;
			case 'offline':
				return <XCircle className='w-5 h-5 text-red-500' />;
			default:
				return <AlertTriangle className='w-5 h-5 text-yellow-500' />;
		}
	};

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Servers</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Manage your deployment servers ({servers.length} total)
					</p>
				</div>
				<Button variant='primary' onClick={() => setShowCreateModal(true)}>
					<Plus className='w-4 h-4 mr-2' />
					Add Server
				</Button>
			</div>

			{/* Search and Filters */}
			<Card>
				<div className='space-y-4'>
					<div className='relative max-w-lg'>
						<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4' />
						<input
							type='text'
							placeholder='Search servers...'
							value={searchQuery}
							onChange={e => setSearchQuery(e.target.value)}
							className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
						/>
					</div>

					{/* Tag Filters */}
					{allTags.length > 0 && (
						<div className='flex flex-wrap items-center gap-2'>
							<Tag className='w-4 h-4 text-gray-400' />
							{allTags.map(tag => (
								<button
									key={tag}
									onClick={() => toggleTag(tag)}
									className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
										selectedTags.includes(tag)
											? 'bg-primary-100 text-primary-700 border border-primary-300'
											: 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
									}`}
								>
									{tag}
								</button>
							))}
							{selectedTags.length > 0 && (
								<button
									onClick={clearTags}
									className='px-2 py-1 text-sm text-gray-500 hover:text-gray-700 flex items-center'
								>
									<X className='w-3 h-3 mr-1' />
									Clear
								</button>
							)}
						</div>
					)}
				</div>
			</Card>

			{/* Servers List */}
			{isLoading ? (
				<div className='flex items-center justify-center h-64'>
					<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
				</div>
			) : filteredServers.length === 0 ? (
				<Card>
					<div className='text-center py-12'>
						<Server className='w-12 h-12 mx-auto mb-3 text-gray-300' />
						<h3 className='text-lg font-medium text-gray-900'>
							No Servers Found
						</h3>
						<p className='mt-2 text-gray-500'>
							{searchQuery
								? 'Try adjusting your search.'
								: 'Add your first server to get started.'}
						</p>
					</div>
				</Card>
			) : (
				<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
					{filteredServers.map(server => (
						<Card key={server.id} className='hover:shadow-md transition-shadow'>
							<div className='space-y-4'>
								<div className='flex items-start justify-between'>
									<div className='flex items-center'>
										{getStatusIcon(server.status)}
										<div className='ml-3'>
											<h3 className='font-semibold text-gray-900'>
												{server.name}
											</h3>
											<p className='text-sm text-gray-500'>{server.hostname}</p>
										</div>
									</div>
									<Badge
										variant={server.status === 'online' ? 'success' : 'warning'}
									>
										{server.status}
									</Badge>
								</div>

								<div className='space-y-2 text-sm'>
									<div className='flex justify-between'>
										<span className='text-gray-500'>Provider</span>
										<span className='capitalize'>{server.provider}</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-gray-500'>SSH</span>
										<span>
											{server.ssh_user}@{server.ssh_port}
										</span>
									</div>
									{server.panel_type && server.panel_type !== 'none' && (
										<div className='flex justify-between'>
											<span className='text-gray-500'>Panel</span>
											<span className='capitalize'>{server.panel_type}</span>
										</div>
									)}
									{server.wp_root_paths && server.wp_root_paths.length > 0 && (
										<div className='flex justify-between'>
											<span className='text-gray-500'>Sites</span>
											<span>{server.wp_root_paths.length} found</span>
										</div>
									)}
									{server.last_health_check && (
										<div className='flex justify-between'>
											<span className='text-gray-500'>Last Check</span>
											<span className='flex items-center'>
												<Clock className='w-3 h-3 mr-1' />
												{new Date(
													server.last_health_check
												).toLocaleDateString()}
											</span>
										</div>
									)}
								</div>

								{/* Action Buttons Row 1: Test & Panel */}
								<div className='flex items-center justify-between pt-4 border-t'>
									<div className='flex items-center space-x-2'>
										<Button
											variant='secondary'
											size='sm'
											onClick={() => testMutation.mutate(server.id)}
											disabled={testMutation.isPending}
											title='Test SSH Connection'
										>
											<Zap className='w-4 h-4 mr-1' />
											Test
										</Button>
										{server.panel_url && (
											<Button
												variant='secondary'
												size='sm'
												onClick={() => getPanelLoginMutation.mutate(server.id)}
												disabled={getPanelLoginMutation.isPending}
												title='Open Control Panel'
											>
												<ExternalLink className='w-4 h-4 mr-1' />
												Panel
											</Button>
										)}
									</div>
									<Button
										variant='secondary'
										size='sm'
										onClick={() => {
											setScanningServer(server);
											setScanResults(null);
											setScanBasePath(
												server.panel_type === 'cyberpanel'
													? '/home'
													: '/var/www'
											);
											setShowScanModal(true);
										}}
										title='Scan for WordPress Sites'
									>
										<FolderSearch className='w-4 h-4 mr-1' />
										Scan
									</Button>
								</div>

								{/* Action Buttons Row 2: Edit & Delete */}
								<div className='flex items-center justify-end space-x-2'>
									<Button
										variant='ghost'
										size='sm'
										onClick={() => {
											setEditingServer(server);
											setFormData({
												name: server.name,
												hostname: server.hostname,
												provider: server.provider,
												ssh_user: server.ssh_user,
												ssh_port: server.ssh_port,
												ssh_key_path: '',
												ssh_password: '', // Don't show existing password
												ssh_private_key: '', // Don't show existing key
												panel_type: server.panel_type,
												panel_url: server.panel_url || '',
												panel_username: '', // Don't show, but allow updating
												panel_password: '', // Don't show, but allow updating
											});
											setShowEditModal(true);
										}}
									>
										<Edit3 className='w-4 h-4' />
									</Button>
									<Button
										variant='ghost'
										size='sm'
										onClick={() => {
											setServerToDelete(server);
											setDeleteConfirmText('');
											setShowDeleteModal(true);
										}}
									>
										<Trash2 className='w-4 h-4 text-red-500' />
									</Button>
								</div>
							</div>
						</Card>
					))}
				</div>
			)}

			{/* Create Modal */}
			{showCreateModal && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-xl p-6 w-full max-w-md'>
						<h2 className='text-xl font-bold mb-4'>Add Server</h2>
						<form
							onSubmit={e => {
								e.preventDefault();
								createMutation.mutate(formData);
							}}
							className='space-y-4'
						>
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Name
								</label>
								<input
									type='text'
									value={formData.name}
									onChange={e =>
										setFormData({ ...formData, name: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									required
								/>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Hostname / IP
								</label>
								<input
									type='text'
									value={formData.hostname}
									onChange={e =>
										setFormData({ ...formData, hostname: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									required
								/>
							</div>
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<label className='block text-sm font-medium text-gray-700 mb-1'>
										SSH User
									</label>
									<input
										type='text'
										value={formData.ssh_user}
										onChange={e =>
											setFormData({ ...formData, ssh_user: e.target.value })
										}
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									/>
								</div>
								<div>
									<label className='block text-sm font-medium text-gray-700 mb-1'>
										SSH Port
									</label>
									<input
										type='number'
										value={formData.ssh_port}
										onChange={e =>
											setFormData({
												...formData,
												ssh_port: parseInt(e.target.value),
											})
										}
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									/>
								</div>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									SSH Password (Optional)
								</label>
								<input
									type='password'
									placeholder='Root/User password'
									value={formData.ssh_password || ''}
									onChange={e =>
										setFormData({ ...formData, ssh_password: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
								/>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									SSH Private Key (Optional)
								</label>
								<textarea
									placeholder='Paste your private key (Starts with -----BEGIN ...)'
									value={formData.ssh_private_key || ''}
									onChange={e =>
										setFormData({
											...formData,
											ssh_private_key: e.target.value,
										})
									}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 h-24 font-mono text-xs'
								/>
								<p className='mt-1 text-xs text-gray-500'>
									Overrides password if provided.
								</p>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Provider & Panel
								</label>
								<select
									value={formData.panel_type}
									onChange={e => {
										const type = e.target.value;
										setFormData({
											...formData,
											panel_type: type,
											provider: type === 'cyberpanel' ? 'cyberpanel' : 'custom',
										});
									}}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
								>
									<option value='none'>Standard / Custom</option>
									<option value='cyberpanel'>CyberPanel</option>
									<option value='cpanel'>cPanel</option>
								</select>
							</div>

							{formData.panel_type === 'cyberpanel' && (
								<div className='space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200'>
									<h3 className='text-sm font-semibold text-gray-900'>
										CyberPanel Configuration
									</h3>
									<div>
										<label className='block text-sm font-medium text-gray-700 mb-1'>
											Panel URL (Port 8090)
										</label>
										<input
											type='text'
											placeholder='https://1.2.3.4:8090'
											value={formData.panel_url}
											onChange={e =>
												setFormData({ ...formData, panel_url: e.target.value })
											}
											className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
										/>
									</div>
									<div className='grid grid-cols-2 gap-4'>
										<div>
											<label className='block text-sm font-medium text-gray-700 mb-1'>
												Panel Username
											</label>
											<input
												type='text'
												placeholder='admin'
												value={formData.panel_username || ''}
												onChange={e =>
													setFormData({
														...formData,
														panel_username: e.target.value,
													})
												}
												className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
											/>
										</div>
										<div>
											<label className='block text-sm font-medium text-gray-700 mb-1'>
												Panel Password
											</label>
											<input
												type='password'
												placeholder='••••••••'
												value={formData.panel_password || ''}
												onChange={e =>
													setFormData({
														...formData,
														panel_password: e.target.value,
													})
												}
												className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
											/>
										</div>
									</div>
									<p className='mt-1 text-xs text-gray-500'>
										Panel credentials for auto-login. SSH credentials are used
										for site management.
									</p>
								</div>
							)}

							<div className='flex justify-end space-x-3 pt-4'>
								<Button
									type='button'
									variant='secondary'
									onClick={() => setShowCreateModal(false)}
								>
									Cancel
								</Button>
								<Button
									type='submit'
									variant='primary'
									disabled={createMutation.isPending}
								>
									{createMutation.isPending ? 'Adding...' : 'Add Server'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Edit Modal */}
			{showEditModal && editingServer && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto'>
						<h2 className='text-xl font-bold mb-4'>
							Edit Server: {editingServer.name}
						</h2>
						<form
							onSubmit={e => {
								e.preventDefault();
								updateMutation.mutate({ id: editingServer.id, ...formData });
							}}
							className='space-y-4'
						>
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Name
								</label>
								<input
									type='text'
									value={formData.name}
									onChange={e =>
										setFormData({ ...formData, name: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									required
								/>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Hostname / IP
								</label>
								<input
									type='text'
									value={formData.hostname}
									onChange={e =>
										setFormData({ ...formData, hostname: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									required
								/>
							</div>
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<label className='block text-sm font-medium text-gray-700 mb-1'>
										SSH User
									</label>
									<input
										type='text'
										value={formData.ssh_user}
										onChange={e =>
											setFormData({ ...formData, ssh_user: e.target.value })
										}
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									/>
								</div>
								<div>
									<label className='block text-sm font-medium text-gray-700 mb-1'>
										SSH Port
									</label>
									<input
										type='number'
										value={formData.ssh_port}
										onChange={e =>
											setFormData({
												...formData,
												ssh_port: parseInt(e.target.value),
											})
										}
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									/>
								</div>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									SSH Password (Leave blank to keep)
								</label>
								<input
									type='password'
									placeholder='New password'
									value={formData.ssh_password || ''}
									onChange={e =>
										setFormData({ ...formData, ssh_password: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
								/>
							</div>

							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									SSH Private Key (Leave blank to keep)
								</label>
								<textarea
									placeholder='New private key'
									value={formData.ssh_private_key || ''}
									onChange={e =>
										setFormData({
											...formData,
											ssh_private_key: e.target.value,
										})
									}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 h-24 font-mono text-xs'
								/>
							</div>

							{formData.panel_type === 'cyberpanel' && (
								<div className='space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200'>
									<h3 className='text-sm font-semibold text-gray-900'>
										CyberPanel Configuration
									</h3>
									<div>
										<label className='block text-sm font-medium text-gray-700 mb-1'>
											Panel URL
										</label>
										<input
											type='text'
											placeholder='https://cp.example.com'
											value={formData.panel_url}
											onChange={e =>
												setFormData({ ...formData, panel_url: e.target.value })
											}
											className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
										/>
									</div>
									<div className='grid grid-cols-2 gap-4'>
										<div>
											<label className='block text-sm font-medium text-gray-700 mb-1'>
												Panel Username
											</label>
											<input
												type='text'
												placeholder='Leave blank to keep'
												value={formData.panel_username || ''}
												onChange={e =>
													setFormData({
														...formData,
														panel_username: e.target.value,
													})
												}
												className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
											/>
										</div>
										<div>
											<label className='block text-sm font-medium text-gray-700 mb-1'>
												Panel Password
											</label>
											<input
												type='password'
												placeholder='Leave blank to keep'
												value={formData.panel_password || ''}
												onChange={e =>
													setFormData({
														...formData,
														panel_password: e.target.value,
													})
												}
												className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
											/>
										</div>
									</div>
									<p className='mt-1 text-xs text-gray-500'>
										Panel credentials for auto-login. Leave blank to keep
										existing.
									</p>
								</div>
							)}

							<div className='flex justify-end space-x-3 pt-4'>
								<Button
									type='button'
									variant='secondary'
									onClick={() => {
										setShowEditModal(false);
										setEditingServer(null);
									}}
								>
									Cancel
								</Button>
								<Button
									type='submit'
									variant='primary'
									disabled={updateMutation.isPending}
								>
									{updateMutation.isPending ? 'Saving...' : 'Save Changes'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}

			{/* Delete Confirmation Modal */}
			{showDeleteModal && serverToDelete && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-xl p-6 w-full max-w-md'>
						<div className='flex items-center space-x-3 mb-4'>
							<div className='p-3 bg-red-100 rounded-full'>
								<Trash2 className='w-6 h-6 text-red-600' />
							</div>
							<div>
								<h2 className='text-xl font-bold text-gray-900'>
									Delete Server
								</h2>
								<p className='text-sm text-gray-500'>
									This action cannot be undone
								</p>
							</div>
						</div>

						<div className='bg-red-50 border border-red-200 rounded-lg p-4 mb-4'>
							<p className='text-sm text-red-800'>
								You are about to delete <strong>{serverToDelete.name}</strong> (
								{serverToDelete.hostname}). All associated data will be
								permanently removed.
							</p>
						</div>

						<div className='mb-4'>
							<label className='block text-sm font-medium text-gray-700 mb-2'>
								Type{' '}
								<strong className='text-red-600'>{serverToDelete.name}</strong>{' '}
								to confirm:
							</label>
							<input
								type='text'
								value={deleteConfirmText}
								onChange={e => setDeleteConfirmText(e.target.value)}
								placeholder={serverToDelete.name}
								className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500'
							/>
						</div>

						<div className='flex justify-end space-x-3'>
							<Button
								variant='secondary'
								onClick={() => {
									setShowDeleteModal(false);
									setServerToDelete(null);
									setDeleteConfirmText('');
								}}
							>
								Cancel
							</Button>
							<Button
								variant='primary'
								className='bg-red-600 hover:bg-red-700'
								disabled={
									deleteConfirmText !== serverToDelete.name ||
									deleteMutation.isPending
								}
								onClick={() => deleteMutation.mutate(serverToDelete.id)}
							>
								{deleteMutation.isPending ? 'Deleting...' : 'Delete Server'}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Scan Sites Modal */}
			{showScanModal && scanningServer && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto'>
						<div className='flex items-center justify-between mb-4'>
							<div className='flex items-center space-x-3'>
								<div className='p-2 bg-blue-100 rounded-lg'>
									<FolderSearch className='w-6 h-6 text-blue-600' />
								</div>
								<div>
									<h2 className='text-xl font-bold text-gray-900'>
										Scan WordPress Sites
									</h2>
									<p className='text-sm text-gray-500'>
										{scanningServer.name} - {scanningServer.hostname}
									</p>
								</div>
							</div>
							<button
								onClick={() => {
									setShowScanModal(false);
									setScanningServer(null);
									setScanResults(null);
								}}
								className='text-gray-400 hover:text-gray-600'
							>
								<X className='w-5 h-5' />
							</button>
						</div>

						{/* Scan Configuration */}
						<div className='mb-6 p-4 bg-gray-50 rounded-lg border'>
							<div className='flex items-end space-x-4'>
								<div className='flex-1'>
									<label className='block text-sm font-medium text-gray-700 mb-1'>
										Base Path
									</label>
									<input
										type='text'
										value={scanBasePath}
										onChange={e => setScanBasePath(e.target.value)}
										placeholder='/home or /var/www'
										className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500'
									/>
									<p className='mt-1 text-xs text-gray-500'>
										CyberPanel: /home | Standard: /var/www
									</p>
								</div>
								<Button
									variant='primary'
									onClick={() =>
										scanSitesMutation.mutate({
											id: scanningServer.id,
											basePath: scanBasePath,
										})
									}
									disabled={scanSitesMutation.isPending}
								>
									{scanSitesMutation.isPending ? (
										<>
											<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
											Scanning...
										</>
									) : (
										<>
											<FolderSearch className='w-4 h-4 mr-2' />
											Start Scan
										</>
									)}
								</Button>
							</div>
						</div>

						{/* Scan Results */}
						{scanResults && (
							<div className='space-y-4'>
								<div
									className={`p-3 rounded-lg ${
										scanResults.success
											? 'bg-green-50 border border-green-200'
											: 'bg-red-50 border border-red-200'
									}`}
								>
									<p
										className={`text-sm ${
											scanResults.success ? 'text-green-800' : 'text-red-800'
										}`}
									>
										{scanResults.message}
									</p>
								</div>

								{scanResults.sites.length > 0 && (
									<div className='space-y-3'>
										<h3 className='text-sm font-semibold text-gray-700'>
											Discovered Sites
										</h3>
										{scanResults.sites.map((site, index) => (
											<div
												key={index}
												className={`p-4 rounded-lg border ${
													site.imported
														? 'bg-gray-50 border-gray-200'
														: 'bg-white border-blue-200'
												}`}
											>
												<div className='flex items-start justify-between'>
													<div className='flex-1'>
														<div className='flex items-center space-x-2'>
															<Globe className='w-4 h-4 text-gray-400' />
															<span className='font-medium text-gray-900'>
																{site.site_name ||
																	site.domain ||
																	'Unknown Site'}
															</span>
															{site.is_bedrock && (
																<Badge variant='info'>Bedrock</Badge>
															)}
															{site.imported && (
																<Badge variant='success'>Imported</Badge>
															)}
														</div>
														{site.site_url && (
															<a
																href={site.site_url}
																target='_blank'
																rel='noopener noreferrer'
																className='text-sm text-blue-600 hover:underline flex items-center mt-1'
															>
																{site.site_url}
																<ExternalLink className='w-3 h-3 ml-1' />
															</a>
														)}
														<p className='text-xs text-gray-500 mt-1 font-mono'>
															{site.path}
														</p>
														<div className='flex items-center space-x-4 mt-2 text-xs text-gray-500'>
															{site.wp_version && (
																<span>WP {site.wp_version}</span>
															)}
														</div>
													</div>
													{!site.imported && (
														<Button
															variant='secondary'
															size='sm'
															onClick={() => {
																// Navigate to create project with pre-filled data
																// For now just close modal - will integrate with CreateProjectWizard
																toast.success(
																	`Ready to import: ${site.domain || site.path}`
																);
																setShowScanModal(false);
															}}
														>
															Import
														</Button>
													)}
												</div>
											</div>
										))}
									</div>
								)}
							</div>
						)}

						{/* Instructions when no results yet */}
						{!scanResults && !scanSitesMutation.isPending && (
							<div className='text-center py-8 text-gray-500'>
								<FolderSearch className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<p>
									Click "Start Scan" to discover WordPress installations on this
									server.
								</p>
								<p className='text-sm mt-2'>
									The scan will find wp-config.php files and detect Bedrock
									installations.
								</p>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
