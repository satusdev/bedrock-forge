import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Settings as SettingsIcon,
	Palette,
	Bell,
	Layout,
	Database,
	Shield,
	Download,
	Upload,
	RotateCcw,
	Save,
	Cloud,
	RefreshCw,
	Loader2,
	Plus,
	Trash2,
	TestTube2,
	Check,
	X,
	MessageSquare,
	HardDrive,
	Github,
	Folder,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { dashboardApi, settingsApi } from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { Key } from 'lucide-react';
import S3IntegrationCard from '@/components/S3IntegrationCard';

const Settings: React.FC = () => {
	const queryClient = useQueryClient();
	const { theme: currentTheme, setTheme: setContextTheme } = useTheme();
	const [activeTab, setActiveTab] = useState('appearance');
	const [cloudflareToken, setCloudflareToken] = useState('');

	// Fetch dashboard configuration
	const { data: configData, isLoading } = useQuery({
		queryKey: ['dashboard-config'],
		queryFn: dashboardApi.getDashboardConfig,
	});

	const config = configData?.data;

	// Update configuration mutation
	const updateConfigMutation = useMutation({
		mutationFn: dashboardApi.updateDashboardConfig,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
		},
	});

	// Theme update mutation
	const updateThemeMutation = useMutation({
		mutationFn: dashboardApi.updateTheme,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
		},
	});

	// Layout preferences mutation
	const updateLayoutMutation = useMutation({
		mutationFn: dashboardApi.updateLayoutPreferences,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
		},
	});

	// Notification preferences mutation
	const updateNotificationsMutation = useMutation({
		mutationFn: dashboardApi.updateNotificationPreferences,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
		},
	});

	// Reset configuration mutation
	const resetConfigMutation = useMutation({
		mutationFn: dashboardApi.resetConfiguration,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
		},
	});

	// Cloudflare queries
	const { data: cfStatus } = useQuery({
		queryKey: ['cloudflare-status'],
		queryFn: dashboardApi.getCloudflareStatus,
	});

	const connectCloudflareMutation = useMutation({
		mutationFn: (token: string) => dashboardApi.connectCloudflare(token),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['cloudflare-status'] });
			toast.success('Cloudflare connected!');
			setCloudflareToken('');
		},
		onError: () => toast.error('Failed to connect Cloudflare'),
	});

	const disconnectCloudflareMutation = useMutation({
		mutationFn: dashboardApi.disconnectCloudflare,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['cloudflare-status'] });
			toast.success('Cloudflare disconnected');
		},
	});

	const syncCloudflareMutation = useMutation({
		mutationFn: dashboardApi.syncCloudflare,
		onSuccess: response => {
			queryClient.invalidateQueries({ queryKey: ['cloudflare-status'] });
			toast.success(
				`Synced ${response.data.domains_synced} domains, ${response.data.ssl_synced} SSL certs`,
			);
		},
		onError: () => toast.error('Sync failed'),
	});

	const tabs = [
		{ id: 'appearance', label: 'Appearance', icon: Palette },
		{ id: 'layout', label: 'Layout', icon: Layout },
		{ id: 'notifications', label: 'Notifications', icon: Bell },
		{ id: 'integrations', label: 'Integrations', icon: Cloud },
		{ id: 'security', label: 'Security', icon: Key },
		{ id: 'advanced', label: 'Advanced', icon: Shield },
	];

	const handleThemeChange = (theme: string) => {
		updateThemeMutation.mutate({ theme });
		setContextTheme(theme as 'light' | 'dark' | 'system');
		toast.success(`Theme changed to ${theme}`);
	};

	const handleColorChange = (
		colorType: 'primary' | 'accent',
		color: string,
	) => {
		const updateData =
			colorType === 'primary'
				? { theme: config?.theme || 'light', primary_color: color }
				: { theme: config?.theme || 'light', accent_color: color };
		updateThemeMutation.mutate(updateData);
	};

	const handleLayoutChange = (updates: any) => {
		updateLayoutMutation.mutate(updates);
	};

	const handleNotificationChange = (updates: any) => {
		updateNotificationsMutation.mutate(updates);
	};

	const handleReset = () => {
		if (
			confirm(
				'Are you sure you want to reset all settings to defaults? This cannot be undone.',
			)
		) {
			resetConfigMutation.mutate();
		}
	};

	const handleExport = () => {
		const exportPath = `/tmp/bedrock-forge-config-${
			new Date().toISOString().split('T')[0]
		}.json`;
		dashboardApi
			.exportConfiguration(exportPath)
			.then(() => {
				alert('Configuration exported successfully!');
			})
			.catch(() => {
				alert('Failed to export configuration');
			});
	};

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600'></div>
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
						Settings
					</h1>
					<p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
						Manage your dashboard preferences and configuration
					</p>
				</div>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
				{/* Sidebar */}
				<div className='lg:col-span-1'>
					<Card>
						<nav className='space-y-1'>
							{tabs.map(tab => {
								const Icon = tab.icon;
								return (
									<button
										key={tab.id}
										onClick={() => setActiveTab(tab.id)}
										className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
											activeTab === tab.id
												? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
												: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
										}`}
									>
										<Icon className='w-4 h-4 mr-3' />
										{tab.label}
									</button>
								);
							})}
						</nav>
					</Card>
				</div>

				{/* Content */}
				<div className='lg:col-span-3'>
					{activeTab === 'appearance' && (
						<div className='space-y-6'>
							<Card title='Theme Settings'>
								<div className='space-y-4'>
									<div>
										<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
											Theme Mode
										</label>
										<div className='grid grid-cols-3 gap-3'>
											{['light', 'dark', 'system'].map(theme => (
												<button
													key={theme}
													onClick={() => handleThemeChange(theme)}
													className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
														currentTheme === theme
															? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
															: 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
													}`}
												>
													{theme.charAt(0).toUpperCase() + theme.slice(1)}
												</button>
											))}
										</div>
									</div>

									<div>
										<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
											Primary Color
										</label>
										<div className='flex items-center space-x-3'>
											<input
												type='color'
												value={config?.primary_color || '#3b82f6'}
												onChange={e =>
													handleColorChange('primary', e.target.value)
												}
												className='h-10 w-20 border border-gray-300 dark:border-gray-600 rounded cursor-pointer'
											/>
											<input
												type='text'
												value={config?.primary_color || '#3b82f6'}
												onChange={e =>
													handleColorChange('primary', e.target.value)
												}
												className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
												placeholder='#3b82f6'
											/>
										</div>
									</div>

									<div>
										<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
											Accent Color
										</label>
										<div className='flex items-center space-x-3'>
											<input
												type='color'
												value={config?.accent_color || '#10b981'}
												onChange={e =>
													handleColorChange('accent', e.target.value)
												}
												className='h-10 w-20 border border-gray-300 dark:border-gray-600 rounded cursor-pointer'
											/>
											<input
												type='text'
												value={config?.accent_color || '#10b981'}
												onChange={e =>
													handleColorChange('accent', e.target.value)
												}
												className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
												placeholder='#10b981'
											/>
										</div>
									</div>
								</div>
							</Card>
						</div>
					)}

					{activeTab === 'layout' && (
						<div className='space-y-6'>
							<Card title='Layout Preferences'>
								<div className='space-y-4'>
									<div className='flex items-center justify-between'>
										<div>
											<h4 className='text-sm font-medium text-gray-900'>
												Collapse Sidebar
											</h4>
											<p className='text-sm text-gray-500'>
												Start with sidebar collapsed
											</p>
										</div>
										<button
											onClick={() =>
												handleLayoutChange({
													sidebar_collapsed: !config?.sidebar_collapsed,
												})
											}
											className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
												config?.sidebar_collapsed
													? 'bg-primary-600'
													: 'bg-gray-200'
											}`}
										>
											<span
												className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
													config?.sidebar_collapsed
														? 'translate-x-6'
														: 'translate-x-1'
												}`}
											/>
										</button>
									</div>

									<div>
										<label className='block text-sm font-medium text-gray-700 mb-2'>
											Default Project View
										</label>
										<select
											value={config?.default_project_view || 'grid'}
											onChange={e =>
												handleLayoutChange({
													default_project_view: e.target.value,
												})
											}
											className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500'
										>
											<option value='grid'>Grid</option>
											<option value='list'>List</option>
											<option value='compact'>Compact</option>
										</select>
									</div>
								</div>
							</Card>
						</div>
					)}

					{activeTab === 'notifications' && (
						<div className='space-y-6'>
							<Card title='Notification Settings'>
								<div className='space-y-4'>
									<div className='flex items-center justify-between'>
										<div>
											<h4 className='text-sm font-medium text-gray-900'>
												Enable Notifications
											</h4>
											<p className='text-sm text-gray-500'>
												Receive notifications for important events
											</p>
										</div>
										<button
											onClick={() =>
												handleNotificationChange({
													notifications_enabled: !config?.notifications_enabled,
												})
											}
											className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
												config?.notifications_enabled
													? 'bg-primary-600'
													: 'bg-gray-200'
											}`}
										>
											<span
												className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
													config?.notifications_enabled
														? 'translate-x-6'
														: 'translate-x-1'
												}`}
											/>
										</button>
									</div>
								</div>
							</Card>

							{/* Notification Channels */}
							<NotificationChannelsSection />
						</div>
					)}

					{activeTab === 'integrations' && (
						<div className='space-y-6'>
							<Card title='Cloudflare Integration'>
								<div className='space-y-4'>
									<p className='text-sm text-gray-600'>
										Connect Cloudflare to sync domains and SSL certificates.
									</p>

									{cfStatus?.data?.connected ? (
										<div className='space-y-4'>
											<div className='flex items-center justify-between p-3 bg-green-50 rounded-lg'>
												<div className='flex items-center'>
													<Cloud className='w-5 h-5 text-green-600 mr-2' />
													<span className='text-green-700 font-medium'>
														Connected
													</span>
													{cfStatus.data.zone_count > 0 && (
														<span className='ml-2 text-sm text-gray-500'>
															({cfStatus.data.zone_count} zones)
														</span>
													)}
												</div>
												<div className='flex items-center space-x-2'>
													<Button
														variant='secondary'
														size='sm'
														onClick={() => syncCloudflareMutation.mutate()}
														disabled={syncCloudflareMutation.isPending}
													>
														{syncCloudflareMutation.isPending ? (
															<Loader2 className='w-4 h-4 mr-1 animate-spin' />
														) : (
															<RefreshCw className='w-4 h-4 mr-1' />
														)}
														Sync
													</Button>
													<Button
														variant='secondary'
														size='sm'
														onClick={() =>
															disconnectCloudflareMutation.mutate()
														}
													>
														Disconnect
													</Button>
												</div>
											</div>
											{cfStatus.data.last_sync && (
												<p className='text-xs text-gray-500'>
													Last synced:{' '}
													{new Date(cfStatus.data.last_sync).toLocaleString()}
												</p>
											)}
										</div>
									) : (
										<div className='space-y-3'>
											<div>
												<label className='block text-sm font-medium text-gray-700 mb-1'>
													API Token
												</label>
												<input
													type='password'
													value={cloudflareToken}
													onChange={e => setCloudflareToken(e.target.value)}
													placeholder='Enter your Cloudflare API token'
													className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
												/>
												<p className='text-xs text-gray-500 mt-1'>
													Create a token with Zone:Read permissions at
													Cloudflare dashboard.
												</p>
											</div>
											<Button
												variant='primary'
												onClick={() =>
													connectCloudflareMutation.mutate(cloudflareToken)
												}
												disabled={
													!cloudflareToken ||
													connectCloudflareMutation.isPending
												}
											>
												{connectCloudflareMutation.isPending ? (
													<Loader2 className='w-4 h-4 mr-2 animate-spin' />
												) : (
													<Cloud className='w-4 h-4 mr-2' />
												)}
												Connect Cloudflare
											</Button>
										</div>
									)}
								</div>
							</Card>

							{/* Google Drive Integration */}
							<GoogleDriveIntegrationCard />

							{/* S3 Integration */}
							<S3IntegrationCard />

							{/* Storage Browser for testing */}
							<StorageBrowserCard />

							{/* GitHub Integration */}
							<GitHubIntegrationCard />
						</div>
					)}

					{activeTab === 'security' && (
						<div className='space-y-6'>
							<SecuritySettings />
						</div>
					)}

					{activeTab === 'advanced' && (
						<div className='space-y-6'>
							<Card title='Advanced Settings'>
								<div className='space-y-4'>
									<div className='flex items-center justify-between'>
										<div>
											<h4 className='text-sm font-medium text-gray-900'>
												Debug Mode
											</h4>
											<p className='text-sm text-gray-500'>
												Enable debug logging and additional info
											</p>
										</div>
										<button
											onClick={() =>
												handleLayoutChange({ debug_mode: !config?.debug_mode })
											}
											className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
												config?.debug_mode ? 'bg-primary-600' : 'bg-gray-200'
											}`}
										>
											<span
												className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
													config?.debug_mode ? 'translate-x-6' : 'translate-x-1'
												}`}
											/>
										</button>
									</div>

									<div className='border-t pt-4'>
										<h4 className='text-sm font-medium text-gray-900 mb-3'>
											Configuration Management
										</h4>
										<div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
											<Button
												variant='secondary'
												onClick={handleExport}
												className='w-full'
											>
												<Download className='w-4 h-4 mr-2' />
												Export Config
											</Button>
											<Button
												variant='secondary'
												onClick={handleReset}
												className='w-full'
												disabled={resetConfigMutation.isLoading}
											>
												<RotateCcw className='w-4 h-4 mr-2' />
												Reset to Defaults
											</Button>
										</div>
									</div>
								</div>
							</Card>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

const SecuritySettings: React.FC = () => {
	const queryClient = useQueryClient();
	const [isEditing, setIsEditing] = useState(false);
	const [privateKeyInput, setPrivateKeyInput] = useState('');

	const { data: sshData, isLoading } = useQuery({
		queryKey: ['system-ssh-key'],
		queryFn: settingsApi.getSystemSSHKey,
	});

	const updateKeyMutation = useMutation({
		mutationFn: settingsApi.updateSystemSSHKey,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['system-ssh-key'] });
			toast.success('System SSH Identity updated successfully');
			setIsEditing(false);
			setPrivateKeyInput('');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to update SSH key');
		},
	});

	const configured = sshData?.data?.configured;
	const publicKey = sshData?.data?.public_key;

	const handleSave = () => {
		if (!privateKeyInput) {
			toast.error('Please enter a private key');
			return;
		}
		updateKeyMutation.mutate(privateKeyInput);
	};

	return (
		<Card title='System SSH Identity'>
			<div className='space-y-6'>
				<p className='text-sm text-gray-600 dark:text-gray-400'>
					Configure a centralized SSH identity for Bedrock Forge. This key will
					be used as a fallback when connecting to servers that don't have
					specific credentials.
				</p>

				{isLoading ? (
					<div className='flex items-center space-x-2 text-primary-600'>
						<Loader2 className='w-5 h-5 animate-spin' />
						<span>Loading identity status...</span>
					</div>
				) : (
					<>
						{configured && !isEditing ? (
							<div className='space-y-4'>
								<div className='bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800'>
									<div className='flex items-center space-x-2 text-green-700 dark:text-green-400 mb-2'>
										<Shield className='w-5 h-5' />
										<span className='font-semibold'>Identity Configured</span>
									</div>
									<p className='text-sm text-green-800 dark:text-green-300'>
										Your system has a valid SSH identity.
									</p>
								</div>

								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
										System Public Key
									</label>
									<div className='relative'>
										<textarea
											readOnly
											value={publicKey}
											className='w-full h-24 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md font-mono text-xs text-gray-600 dark:text-gray-400 focus:outline-none'
											onClick={e => e.currentTarget.select()}
										/>
										<div className='absolute top-2 right-2'>
											<Button
												size='sm'
												variant='secondary'
												onClick={() => {
													navigator.clipboard.writeText(publicKey);
													toast.success('Public key copied to clipboard');
												}}
											>
												Copy
											</Button>
										</div>
									</div>
									<p className='mt-2 text-xs text-gray-500'>
										Add this public key to the{' '}
										<code>~/.ssh/authorized_keys</code> file on your servers.
									</p>
								</div>

								<div className='pt-4 border-t border-gray-200 dark:border-gray-700'>
									<Button
										variant='secondary'
										onClick={() => setIsEditing(true)}
									>
										Update Private Key
									</Button>
								</div>
							</div>
						) : (
							<div className='space-y-4'>
								{!configured && (
									<div className='bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800 mb-4'>
										<div className='flex items-center space-x-2 text-yellow-700 dark:text-yellow-400'>
											<Shield className='w-5 h-5' />
											<span className='font-medium'>
												No Identity Configured
											</span>
										</div>
										<p className='mt-1 text-sm text-yellow-800 dark:text-yellow-300'>
											Please provide an SSH Private Key to enable centralized
											server access.
										</p>
									</div>
								)}

								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
										Private Key
									</label>
									<textarea
										value={privateKeyInput}
										onChange={e => setPrivateKeyInput(e.target.value)}
										placeholder='-----BEGIN OPENSSH PRIVATE KEY-----...'
										className='w-full h-48 p-3 font-mono text-xs border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
									/>
									<p className='mt-2 text-xs text-gray-500'>
										Paste your private key here (e.g. from Bitwarden). It will
										be encrypted and stored securely.
									</p>
								</div>

								<div className='flex space-x-3'>
									<Button
										variant='primary'
										onClick={handleSave}
										disabled={
											updateKeyMutation.isPending || !privateKeyInput.trim()
										}
									>
										{updateKeyMutation.isPending && (
											<Loader2 className='w-4 h-4 mr-2 animate-spin' />
										)}
										Save Identity
									</Button>
									{configured && (
										<Button
											variant='secondary'
											onClick={() => setIsEditing(false)}
										>
											Cancel
										</Button>
									)}
								</div>
							</div>
						)}
					</>
				)}
			</div>
		</Card>
	);
};

// Notification Channels Section Component
interface NotificationChannel {
	id: number;
	name: string;
	channel_type: 'slack' | 'email' | 'telegram' | 'webhook' | 'discord';
	config: Record<string, any>;
	is_active: boolean;
	last_sent_at: string | null;
	last_error: string | null;
	created_at: string | null;
}

const NotificationChannelsSection: React.FC = () => {
	const queryClient = useQueryClient();
	const [showAddModal, setShowAddModal] = useState(false);
	const [testingId, setTestingId] = useState<number | null>(null);

	const { data: channelsData, isLoading } = useQuery({
		queryKey: ['notification-channels'],
		queryFn: dashboardApi.getNotificationChannels,
	});

	const deleteChannelMutation = useMutation({
		mutationFn: (id: number) => dashboardApi.deleteNotificationChannel(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
			toast.success('Notification channel deleted');
		},
		onError: () => toast.error('Failed to delete channel'),
	});

	const testChannelMutation = useMutation({
		mutationFn: (id: number) =>
			dashboardApi.testNotificationChannel({ channel_id: id }),
		onSuccess: response => {
			if (response.data.status === 'success') {
				toast.success('Test notification sent!');
			} else {
				toast.error(response.data.message || 'Test failed');
			}
			setTestingId(null);
		},
		onError: () => {
			toast.error('Failed to send test notification');
			setTestingId(null);
		},
	});

	const toggleChannelMutation = useMutation({
		mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
			dashboardApi.updateNotificationChannel(id, { is_active }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['notification-channels'] });
		},
	});

	const channels: NotificationChannel[] = channelsData?.data?.channels || [];

	const handleTest = (id: number) => {
		setTestingId(id);
		testChannelMutation.mutate(id);
	};

	const handleDelete = (id: number, name: string) => {
		if (confirm(`Delete notification channel "${name}"?`)) {
			deleteChannelMutation.mutate(id);
		}
	};

	const getChannelIcon = (type: string) => {
		switch (type) {
			case 'slack':
				return <MessageSquare className='w-5 h-5 text-purple-500' />;
			case 'email':
				return <Bell className='w-5 h-5 text-blue-500' />;
			case 'telegram':
				return <MessageSquare className='w-5 h-5 text-sky-500' />;
			case 'discord':
				return <MessageSquare className='w-5 h-5 text-indigo-500' />;
			case 'webhook':
				return <Cloud className='w-5 h-5 text-gray-500' />;
			default:
				return <Bell className='w-5 h-5' />;
		}
	};

	return (
		<>
			<Card title='Notification Channels'>
				<div className='space-y-4'>
					<div className='flex justify-between items-center'>
						<p className='text-sm text-gray-600 dark:text-gray-400'>
							Configure channels to receive alerts for monitor downtime, backup
							failures, and other events.
						</p>
						<Button size='sm' onClick={() => setShowAddModal(true)}>
							<Plus className='w-4 h-4 mr-1' /> Add Channel
						</Button>
					</div>

					{isLoading ? (
						<div className='flex items-center justify-center py-8'>
							<Loader2 className='w-6 h-6 animate-spin text-primary-600' />
						</div>
					) : channels.length === 0 ? (
						<div className='text-center py-8 text-gray-500 dark:text-gray-400'>
							<Bell className='w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600' />
							<p>No notification channels configured.</p>
							<p className='text-sm'>Add a channel to receive alerts.</p>
						</div>
					) : (
						<div className='space-y-3'>
							{channels.map(channel => (
								<div
									key={channel.id}
									className='flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg'
								>
									<div className='flex items-center space-x-3'>
										{getChannelIcon(channel.channel_type)}
										<div>
											<div className='flex items-center space-x-2'>
												<span className='font-medium text-gray-900 dark:text-white'>
													{channel.name}
												</span>
												<Badge
													variant={channel.is_active ? 'success' : 'default'}
													className='text-xs'
												>
													{channel.is_active ? 'Active' : 'Inactive'}
												</Badge>
											</div>
											<span className='text-xs text-gray-500 dark:text-gray-400 capitalize'>
												{channel.channel_type}
												{channel.last_sent_at && (
													<>
														{' '}
														· Last sent:{' '}
														{new Date(channel.last_sent_at).toLocaleString()}
													</>
												)}
											</span>
										</div>
									</div>
									<div className='flex items-center space-x-2'>
										<button
											onClick={() =>
												toggleChannelMutation.mutate({
													id: channel.id,
													is_active: !channel.is_active,
												})
											}
											className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
												channel.is_active
													? 'bg-primary-600'
													: 'bg-gray-300 dark:bg-gray-600'
											}`}
											title={channel.is_active ? 'Disable' : 'Enable'}
										>
											<span
												className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
													channel.is_active ? 'translate-x-5' : 'translate-x-1'
												}`}
											/>
										</button>
										<Button
											size='sm'
											variant='secondary'
											onClick={() => handleTest(channel.id)}
											disabled={testingId === channel.id}
											title='Send test notification'
										>
											{testingId === channel.id ? (
												<Loader2 className='w-4 h-4 animate-spin' />
											) : (
												<TestTube2 className='w-4 h-4' />
											)}
										</Button>
										<Button
											size='sm'
											variant='secondary'
											onClick={() => handleDelete(channel.id, channel.name)}
											className='text-red-600 hover:text-red-700'
											title='Delete channel'
										>
											<Trash2 className='w-4 h-4' />
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</Card>

			{showAddModal && (
				<AddNotificationChannelModal
					onClose={() => setShowAddModal(false)}
					onSuccess={() => {
						queryClient.invalidateQueries({
							queryKey: ['notification-channels'],
						});
						setShowAddModal(false);
					}}
				/>
			)}
		</>
	);
};

// Add Notification Channel Modal
interface AddNotificationChannelModalProps {
	onClose: () => void;
	onSuccess: () => void;
}

const AddNotificationChannelModal: React.FC<
	AddNotificationChannelModalProps
> = ({ onClose, onSuccess }) => {
	const [channelType, setChannelType] = useState<
		'slack' | 'email' | 'telegram' | 'webhook' | 'discord'
	>('slack');
	const [name, setName] = useState('');
	const [config, setConfig] = useState<Record<string, string>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isTesting, setIsTesting] = useState(false);

	const createChannelMutation = useMutation({
		mutationFn: dashboardApi.createNotificationChannel,
		onSuccess: () => {
			toast.success('Notification channel created!');
			onSuccess();
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to create channel');
		},
	});

	const testMutation = useMutation({
		mutationFn: dashboardApi.testNotificationChannel,
		onSuccess: response => {
			if (response.data.status === 'success') {
				toast.success('Test notification sent!');
			} else {
				toast.error(
					response.data.message || 'Test failed - check your configuration',
				);
			}
			setIsTesting(false);
		},
		onError: () => {
			toast.error('Test failed - check your configuration');
			setIsTesting(false);
		},
	});

	const handleTest = () => {
		if (!validateConfig()) return;
		setIsTesting(true);
		testMutation.mutate({
			channel_type: channelType,
			config,
		});
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) {
			toast.error('Please enter a channel name');
			return;
		}
		if (!validateConfig()) return;

		setIsSubmitting(true);
		try {
			await createChannelMutation.mutateAsync({
				name: name.trim(),
				channel_type: channelType,
				config,
				is_active: true,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const validateConfig = () => {
		const webhookUrl =
			typeof config.webhook_url === 'string' ? config.webhook_url : '';

		switch (channelType) {
			case 'slack':
				if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
					toast.error('Please enter a valid Slack webhook URL');
					return false;
				}
				break;
			case 'email':
				if (!config.to || !config.to.includes('@')) {
					toast.error('Please enter a valid email address');
					return false;
				}
				break;
			case 'telegram':
				if (!config.bot_token || !config.chat_id) {
					toast.error('Please enter bot token and chat ID');
					return false;
				}
				break;
			case 'webhook':
			case 'discord':
				if (!webhookUrl || !webhookUrl.startsWith('https://')) {
					toast.error('Please enter a valid webhook URL');
					return false;
				}
				break;
		}
		return true;
	};

	const renderConfigFields = () => {
		switch (channelType) {
			case 'slack':
				return (
					<div>
						<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
							Webhook URL *
						</label>
						<input
							type='url'
							value={config.webhook_url || ''}
							onChange={e =>
								setConfig({ ...config, webhook_url: e.target.value })
							}
							placeholder='https://hooks.slack.com/services/...'
							className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
							required
						/>
						<p className='text-xs text-gray-500 mt-1'>
							Create an incoming webhook in your Slack workspace settings.
						</p>
					</div>
				);

			case 'email':
				return (
					<div className='space-y-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								To Address *
							</label>
							<input
								type='email'
								value={config.to || ''}
								onChange={e => setConfig({ ...config, to: e.target.value })}
								placeholder='admin@example.com'
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
								required
							/>
						</div>
						<p className='text-xs text-gray-500'>
							Uses system SMTP settings. Configure SMTP in environment
							variables.
						</p>
					</div>
				);

			case 'telegram':
				return (
					<div className='space-y-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Bot Token *
							</label>
							<input
								type='password'
								value={config.bot_token || ''}
								onChange={e =>
									setConfig({ ...config, bot_token: e.target.value })
								}
								placeholder='123456789:ABC...'
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
								required
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Chat ID *
							</label>
							<input
								type='text'
								value={config.chat_id || ''}
								onChange={e =>
									setConfig({ ...config, chat_id: e.target.value })
								}
								placeholder='-123456789'
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
								required
							/>
						</div>
					</div>
				);

			case 'webhook':
			case 'discord':
				return (
					<div>
						<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
							Webhook URL *
						</label>
						<input
							type='url'
							value={config.webhook_url || ''}
							onChange={e =>
								setConfig({ ...config, webhook_url: e.target.value })
							}
							placeholder={
								channelType === 'discord'
									? 'https://discord.com/api/webhooks/...'
									: 'https://your-webhook-endpoint.com/webhook'
							}
							className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
							required
						/>
					</div>
				);

			default:
				return null;
		}
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg'>
				<div className='flex items-center justify-between p-4 border-b dark:border-gray-700'>
					<h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
						Add Notification Channel
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
							Channel Name *
						</label>
						<input
							type='text'
							value={name}
							onChange={e => setName(e.target.value)}
							placeholder='e.g., Production Alerts'
							className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
							required
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
							Channel Type
						</label>
						<select
							value={channelType}
							onChange={e => {
								setChannelType(e.target.value as any);
								setConfig({});
							}}
							className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
						>
							<option value='slack'>Slack</option>
							<option value='email'>Email</option>
							<option value='telegram'>Telegram</option>
							<option value='discord'>Discord</option>
							<option value='webhook'>Custom Webhook</option>
						</select>
					</div>

					{renderConfigFields()}

					<div className='flex justify-between pt-4 border-t dark:border-gray-700'>
						<Button
							type='button'
							variant='secondary'
							onClick={handleTest}
							disabled={isTesting}
						>
							{isTesting ? (
								<Loader2 className='w-4 h-4 mr-2 animate-spin' />
							) : (
								<TestTube2 className='w-4 h-4 mr-2' />
							)}
							Test
						</Button>
						<div className='flex space-x-3'>
							<Button type='button' variant='secondary' onClick={onClose}>
								Cancel
							</Button>
							<Button type='submit' disabled={isSubmitting}>
								{isSubmitting ? (
									<Loader2 className='w-4 h-4 mr-2 animate-spin' />
								) : (
									<Check className='w-4 h-4 mr-2' />
								)}
								Create Channel
							</Button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
};

// Google Drive Integration Card Component
const GoogleDriveIntegrationCard: React.FC = () => {
	const queryClient = useQueryClient();
	const [remoteName, setRemoteName] = useState('gdrive');
	const [basePath, setBasePath] = useState('WebDev/Projects');
	const [showSetupModal, setShowSetupModal] = useState(false);

	const { data: gdriveStatus, isLoading: statusLoading } = useQuery({
		queryKey: ['gdrive-status'],
		queryFn: dashboardApi.getDriveStatus,
	});

	const { data: configData } = useQuery({
		queryKey: ['dashboard-config'],
		queryFn: dashboardApi.getDashboardConfig,
	});

	const updateConfigMutation = useMutation({
		mutationFn: dashboardApi.updateDashboardConfig,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
			queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
			toast.success('Drive settings updated');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to update settings');
		},
	});

	React.useEffect(() => {
		if (!configData?.data) return;
		setRemoteName(configData.data.gdrive_rclone_remote || 'gdrive');
		setBasePath(configData.data.gdrive_base_path || 'WebDev/Projects');
	}, [configData]);

	const handleSave = () => {
		if (!configData?.data) return;
		updateConfigMutation.mutate({
			...configData.data,
			gdrive_rclone_remote: remoteName.trim() || 'gdrive',
			gdrive_base_path: basePath.trim() || 'WebDev/Projects',
		});
	};

	const configured = gdriveStatus?.data?.configured;

	return (
		<>
			<Card title='Google Drive Integration'>
				<div className='space-y-4'>
					<p className='text-sm text-gray-600 dark:text-gray-400'>
						Configure rclone for Google Drive backups and folder browsing.
					</p>

					{statusLoading ? (
						<div className='flex items-center'>
							<Loader2 className='w-5 h-5 animate-spin text-gray-500' />
							<span className='ml-2 text-sm text-gray-500'>
								Checking status...
							</span>
						</div>
					) : configured ? (
						<div className='space-y-4'>
							<div className='flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg'>
								<div className='flex items-center'>
									<HardDrive className='w-5 h-5 text-green-600 dark:text-green-400 mr-2' />
									<div>
										<span className='text-green-700 dark:text-green-300 font-medium'>
											Connected
										</span>
										<p className='text-sm text-gray-500 dark:text-gray-400'>
											Remote: {gdriveStatus?.data?.remote_name || remoteName}
										</p>
									</div>
								</div>
							</div>
							<p className='text-xs text-gray-500'>
								{gdriveStatus?.data?.message || 'rclone is configured'}
							</p>
						</div>
					) : (
						<div className='space-y-3'>
							<div className='flex items-center justify-between p-3 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 rounded-lg'>
								<div className='flex items-center space-x-2'>
									<HardDrive className='w-4 h-4' />
									<span className='text-sm font-medium'>
										{gdriveStatus?.data?.message ||
											'Google Drive not configured'}
									</span>
								</div>
								<Button
									size='sm'
									variant='primary'
									onClick={() => setShowSetupModal(true)}
								>
									<Plus className='w-4 h-4 mr-1' />
									Configure
								</Button>
							</div>
						</div>
					)}

					<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								rclone Remote Name
							</label>
							<input
								value={remoteName}
								onChange={e => setRemoteName(e.target.value)}
								placeholder='gdrive'
								className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white dark:border-gray-600'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Base Path
							</label>
							<input
								value={basePath}
								onChange={e => setBasePath(e.target.value)}
								placeholder='WebDev/Projects'
								className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white dark:border-gray-600'
							/>
							<p className='text-xs text-gray-500 mt-1'>
								Default path: {`gdrive:${basePath || 'WebDev/Projects'}`}
							</p>
						</div>
					</div>

					<div className='flex items-center gap-2'>
						<Button
							variant='primary'
							onClick={handleSave}
							disabled={updateConfigMutation.isPending}
						>
							{updateConfigMutation.isPending ? (
								<Loader2 className='w-4 h-4 mr-2 animate-spin' />
							) : (
								<Save className='w-4 h-4 mr-2' />
							)}
							Save Settings
						</Button>
						<Button
							variant='secondary'
							onClick={() =>
								queryClient.invalidateQueries({ queryKey: ['gdrive-status'] })
							}
						>
							<RefreshCw className='w-4 h-4 mr-2' />
							Refresh Status
						</Button>
						{configured && (
							<Button
								variant='secondary'
								onClick={() => setShowSetupModal(true)}
							>
								Reconfigure
							</Button>
						)}
					</div>
				</div>
			</Card>

			{showSetupModal && (
				<RcloneSetupModal
					remoteName={remoteName}
					onClose={() => setShowSetupModal(false)}
					onSuccess={() => {
						queryClient.invalidateQueries({ queryKey: ['gdrive-status'] });
						queryClient.invalidateQueries({ queryKey: ['rclone-remotes'] });
						setShowSetupModal(false);
					}}
				/>
			)}
		</>
	);
};

// Rclone Setup Modal - 3-step wizard for headless authentication
interface RcloneSetupModalProps {
	remoteName: string;
	onClose: () => void;
	onSuccess: () => void;
}

const RcloneSetupModal: React.FC<RcloneSetupModalProps> = ({
	remoteName,
	onClose,
	onSuccess,
}) => {
	const [step, setStep] = useState(1);
	const [token, setToken] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [copied, setCopied] = useState(false);

	const authorizeCommand = 'rclone authorize "drive"';

	const authorizeMutation = useMutation({
		mutationFn: dashboardApi.authorizeRclone,
		onSuccess: response => {
			if (response.data.success) {
				toast.success(
					response.data.message || 'Google Drive configured successfully!',
				);
				onSuccess();
			} else {
				toast.error(response.data.message || 'Configuration failed');
			}
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to authorize rclone');
		},
		onSettled: () => {
			setIsSubmitting(false);
		},
	});

	const handleCopyCommand = async () => {
		try {
			await navigator.clipboard.writeText(authorizeCommand);
			setCopied(true);
			toast.success('Command copied to clipboard');
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error('Failed to copy');
		}
	};

	const handleSubmit = () => {
		if (!token.trim()) {
			toast.error('Please paste the token from rclone authorize');
			return;
		}

		// Validate JSON format
		try {
			JSON.parse(token.trim());
		} catch {
			toast.error('Invalid token format. Please paste the entire JSON output.');
			return;
		}

		setIsSubmitting(true);
		authorizeMutation.mutate({
			token: token.trim(),
			remote_name: remoteName,
			scope: 'drive',
		});
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto'>
				<div className='flex items-center justify-between p-4 border-b dark:border-gray-700'>
					<h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
						Configure Google Drive
					</h2>
					<button
						onClick={onClose}
						className='text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
					>
						<X className='w-6 h-6' />
					</button>
				</div>

				{/* Progress Steps */}
				<div className='flex items-center justify-center p-4 border-b dark:border-gray-700'>
					{[1, 2, 3].map(s => (
						<React.Fragment key={s}>
							<div
								className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
									step >= s
										? 'bg-primary-600 text-white'
										: 'bg-gray-200 dark:bg-gray-700 text-gray-500'
								}`}
							>
								{step > s ? <Check className='w-4 h-4' /> : s}
							</div>
							{s < 3 && (
								<div
									className={`w-16 h-1 mx-2 ${
										step > s ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
									}`}
								/>
							)}
						</React.Fragment>
					))}
				</div>

				<div className='p-6'>
					{step === 1 && (
						<div className='space-y-4'>
							<h3 className='text-lg font-medium text-gray-900 dark:text-white'>
								Step 1: Install rclone on your local machine
							</h3>
							<p className='text-sm text-gray-600 dark:text-gray-400'>
								rclone must be installed on a computer with a web browser (not
								in Docker).
							</p>
							<div className='bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3'>
								<div>
									<span className='text-xs font-medium text-gray-500 uppercase'>
										Linux/macOS:
									</span>
									<code className='block mt-1 text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded'>
										curl https://rclone.org/install.sh | sudo bash
									</code>
								</div>
								<div>
									<span className='text-xs font-medium text-gray-500 uppercase'>
										macOS (Homebrew):
									</span>
									<code className='block mt-1 text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded'>
										brew install rclone
									</code>
								</div>
								<div>
									<span className='text-xs font-medium text-gray-500 uppercase'>
										Windows:
									</span>
									<p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
										Download from{' '}
										<a
											href='https://rclone.org/downloads/'
											target='_blank'
											rel='noopener noreferrer'
											className='text-primary-600 hover:underline'
										>
											rclone.org/downloads
										</a>
									</p>
								</div>
							</div>
							<div className='flex justify-end'>
								<Button onClick={() => setStep(2)}>
									Next <span className='ml-1'>→</span>
								</Button>
							</div>
						</div>
					)}

					{step === 2 && (
						<div className='space-y-4'>
							<h3 className='text-lg font-medium text-gray-900 dark:text-white'>
								Step 2: Run the authorize command
							</h3>
							<p className='text-sm text-gray-600 dark:text-gray-400'>
								Run this command on your local machine. It will open a browser
								for Google authentication.
							</p>
							<div className='flex items-center gap-2'>
								<code className='flex-1 text-sm bg-gray-100 dark:bg-gray-800 p-3 rounded-lg font-mono'>
									{authorizeCommand}
								</code>
								<Button variant='secondary' onClick={handleCopyCommand}>
									{copied ? <Check className='w-4 h-4' /> : 'Copy'}
								</Button>
							</div>
							<div className='bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg'>
								<p className='text-sm text-blue-700 dark:text-blue-300'>
									<strong>After authenticating:</strong> rclone will display a
									JSON token in your terminal. Copy the entire JSON output
									(including the curly braces).
								</p>
							</div>
							<div className='flex justify-between'>
								<Button variant='secondary' onClick={() => setStep(1)}>
									<span className='mr-1'>←</span> Back
								</Button>
								<Button onClick={() => setStep(3)}>
									Next <span className='ml-1'>→</span>
								</Button>
							</div>
						</div>
					)}

					{step === 3 && (
						<div className='space-y-4'>
							<h3 className='text-lg font-medium text-gray-900 dark:text-white'>
								Step 3: Paste the token
							</h3>
							<p className='text-sm text-gray-600 dark:text-gray-400'>
								Paste the JSON token that rclone displayed after authentication.
							</p>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Token (JSON)
								</label>
								<textarea
									value={token}
									onChange={e => setToken(e.target.value)}
									placeholder='{"access_token":"...", "token_type":"Bearer", "refresh_token":"...", "expiry":"..."}'
									rows={5}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white font-mono text-sm'
								/>
							</div>
							<div className='flex justify-between'>
								<Button variant='secondary' onClick={() => setStep(2)}>
									<span className='mr-1'>←</span> Back
								</Button>
								<Button
									variant='primary'
									onClick={handleSubmit}
									disabled={isSubmitting || !token.trim()}
								>
									{isSubmitting ? (
										<Loader2 className='w-4 h-4 mr-2 animate-spin' />
									) : (
										<Check className='w-4 h-4 mr-2' />
									)}
									Complete Setup
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

// GitHub Integration Card Component
const GitHubIntegrationCard: React.FC = () => {
	const queryClient = useQueryClient();
	const [isConnecting, setIsConnecting] = useState(false);
	const [showTokenInput, setShowTokenInput] = useState(false);
	const [token, setToken] = useState('');

	const { data: githubStatus, isLoading } = useQuery({
		queryKey: ['github-status'],
		queryFn: dashboardApi.getGitHubAuthStatus,
	});

	const disconnectMutation = useMutation({
		mutationFn: dashboardApi.disconnectGitHub,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['github-status'] });
			toast.success('GitHub disconnected');
		},
		onError: () => toast.error('Failed to disconnect GitHub'),
	});

	const connectWithTokenMutation = useMutation({
		mutationFn: (pat: string) => dashboardApi.authenticateGitHub(pat),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['github-status'] });
			toast.success('GitHub connected successfully!');
			setShowTokenInput(false);
			setToken('');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to connect GitHub');
		},
	});

	// Handle OAuth callback from URL
	React.useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('code');
		const state = urlParams.get('state');
		const oauthProvider = urlParams.get('oauth');

		if (code && (oauthProvider === 'github' || state?.includes('github'))) {
			setIsConnecting(true);
			dashboardApi
				.authenticateGitHub(code, state || '')
				.then(() => {
					queryClient.invalidateQueries({ queryKey: ['github-status'] });
					toast.success('GitHub connected successfully!');
					window.history.replaceState({}, document.title, '/settings');
				})
				.catch(err => {
					toast.error(
						'Failed to connect GitHub: ' +
							(err.response?.data?.detail || err.message),
					);
				})
				.finally(() => setIsConnecting(false));
		}
	}, [queryClient]);

	const handleOAuthConnect = async () => {
		try {
			setIsConnecting(true);
			const response = await dashboardApi.getGitHubAuthUrl(
				window.location.origin + '/settings?oauth=github',
			);
			if (response.data?.auth_url) {
				window.location.href = response.data.auth_url;
			} else {
				toast.error(
					'GitHub OAuth not configured. Use Personal Access Token instead.',
				);
				setShowTokenInput(true);
				setIsConnecting(false);
			}
		} catch (error: any) {
			// If OAuth not configured, fall back to PAT
			if (error.response?.status === 400) {
				toast('GitHub OAuth not configured. Use Personal Access Token.', {
					icon: 'ℹ️',
				});
				setShowTokenInput(true);
			} else {
				toast.error(
					error.response?.data?.detail || 'Failed to start OAuth flow',
				);
			}
			setIsConnecting(false);
		}
	};

	const connected = githubStatus?.data?.authenticated;

	return (
		<Card title='GitHub Integration'>
			<div className='space-y-4'>
				<p className='text-sm text-gray-600 dark:text-gray-400'>
					Connect GitHub for repository management and deployments.
				</p>

				{isLoading ? (
					<div className='flex items-center'>
						<Loader2 className='w-5 h-5 animate-spin text-gray-500' />
						<span className='ml-2 text-sm text-gray-500'>
							Checking status...
						</span>
					</div>
				) : connected ? (
					<div className='space-y-4'>
						<div className='flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg'>
							<div className='flex items-center'>
								<Github className='w-5 h-5 text-green-600 dark:text-green-400 mr-2' />
								<div>
									<span className='text-green-700 dark:text-green-300 font-medium'>
										Connected
									</span>
									{githubStatus?.data?.login && (
										<p className='text-sm text-gray-500 dark:text-gray-400'>
											@{githubStatus.data.login}
										</p>
									)}
								</div>
							</div>
							<Button
								variant='secondary'
								size='sm'
								onClick={() => disconnectMutation.mutate()}
								disabled={disconnectMutation.isPending}
							>
								{disconnectMutation.isPending ? (
									<Loader2 className='w-4 h-4 animate-spin' />
								) : (
									'Disconnect'
								)}
							</Button>
						</div>
					</div>
				) : showTokenInput ? (
					<div className='space-y-3'>
						<div>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Personal Access Token
							</label>
							<input
								type='password'
								value={token}
								onChange={e => setToken(e.target.value)}
								placeholder='ghp_xxxxxxxxxxxx'
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
							/>
							<p className='text-xs text-gray-500 mt-1'>
								Create a token with repo scope at{' '}
								<a
									href='https://github.com/settings/tokens'
									target='_blank'
									rel='noopener noreferrer'
									className='text-primary-600 hover:underline'
								>
									GitHub Settings
								</a>
							</p>
						</div>
						<div className='flex space-x-2'>
							<Button
								variant='primary'
								onClick={() => connectWithTokenMutation.mutate(token)}
								disabled={!token || connectWithTokenMutation.isPending}
							>
								{connectWithTokenMutation.isPending ? (
									<Loader2 className='w-4 h-4 mr-2 animate-spin' />
								) : (
									<Github className='w-4 h-4 mr-2' />
								)}
								Connect
							</Button>
							<Button
								variant='secondary'
								onClick={() => setShowTokenInput(false)}
							>
								Cancel
							</Button>
						</div>
					</div>
				) : (
					<div className='flex space-x-2'>
						<Button
							variant='primary'
							onClick={handleOAuthConnect}
							disabled={isConnecting}
						>
							{isConnecting ? (
								<Loader2 className='w-4 h-4 mr-2 animate-spin' />
							) : (
								<Github className='w-4 h-4 mr-2' />
							)}
							Connect with GitHub
						</Button>
						<Button variant='secondary' onClick={() => setShowTokenInput(true)}>
							Use Token
						</Button>
					</div>
				)}
			</div>
		</Card>
	);
};

// Storage Browser Card for testing Drive configuration
const StorageBrowserCard: React.FC = () => {
	const [folders, setFolders] = useState<{ path: string; source?: string }[]>(
		[],
	);
	const [isLoading, setIsLoading] = useState(false);
	const [hasLoaded, setHasLoaded] = useState(false);

	const handleBrowse = async () => {
		setIsLoading(true);
		try {
			const response = await dashboardApi.listDriveFolders({
				shared_with_me: true,
				max_results: 100,
			});
			setFolders(response.data?.folders || []);
			setHasLoaded(true);
			if ((response.data?.folders || []).length === 0) {
				toast('No folders found', { icon: '📂' });
			}
		} catch (error) {
			console.error('Browse failed:', error);
			toast.error('Failed to browse Drive folders');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Card title='Storage Browser'>
			<div className='space-y-4'>
				<p className='text-sm text-gray-600 dark:text-gray-400'>
					Test your Google Drive connection by browsing available folders.
				</p>

				<Button variant='secondary' onClick={handleBrowse} disabled={isLoading}>
					{isLoading ? (
						<>
							<Loader2 className='w-4 h-4 mr-2 animate-spin' />
							Loading...
						</>
					) : (
						<>
							<HardDrive className='w-4 h-4 mr-2' />
							Browse Drive
						</>
					)}
				</Button>

				{hasLoaded && (
					<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4'>
						{folders.length === 0 ? (
							<div className='col-span-full text-center py-8 text-gray-500'>
								No folders found. Check your rclone configuration.
							</div>
						) : (
							folders.map((folder, index) => (
								<div
									key={`${folder.path}-${index}`}
									className='p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-600 transition-colors'
								>
									<div className='flex items-start gap-2'>
										<Folder className='w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5' />
										<div className='min-w-0 flex-1'>
											<p className='text-sm font-medium text-gray-900 dark:text-white truncate'>
												{folder.path.split('/').pop() || folder.path}
											</p>
											<p className='text-xs text-gray-500 truncate'>
												{folder.path}
											</p>
											{folder.source && (
												<span className='inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'>
													{folder.source}
												</span>
											)}
										</div>
									</div>
								</div>
							))
						)}
					</div>
				)}
			</div>
		</Card>
	);
};

export default Settings;
