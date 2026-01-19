/**
 * Project Detail Page
 * Full project view with tabs for Overview, Environments, Plugins, Backups, Git.
 */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	Globe,
	Github,
	Cloud,
	Play,
	Pause,
	RefreshCw,
	Package,
	Archive,
	GitBranch,
	Settings,
	ExternalLink,
	AlertTriangle,
	Server,
	Plus,
	Trash2,
	ArrowRight,
	ArrowLeftRight,
	Copy,
	Download,
	RotateCcw,
	Clock,
	CheckCircle,
	XCircle,
	Shield,
	AlertCircle,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import LinkEnvironmentModal from '../components/LinkEnvironmentModal';
import SyncModal from '../components/SyncModal';
import api, { dashboardApi } from '../services/api';
import toast from 'react-hot-toast';

type TabId =
	| 'overview'
	| 'environments'
	| 'plugins'
	| 'backups'
	| 'git'
	| 'security';

// Security Scan Result Types
interface SecurityCheck {
	name: string;
	status: 'pass' | 'warn' | 'fail';
	message: string;
	severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
	details?: Record<string, any>;
}

interface SecurityScanResult {
	project_id: number;
	project_name: string;
	scanned_at: string;
	overall_status: 'pass' | 'warn' | 'fail';
	score: number;
	checks: SecurityCheck[];
	summary: { pass: number; warn: number; fail: number };
}

interface Environment {
	id: number;
	environment: 'staging' | 'production' | 'development';
	server_id: number;
	server_name: string;
	server_hostname: string;
	wp_url: string;
	wp_path: string;
	notes: string | null;
	is_primary: boolean;
	created_at: string;
	updated_at: string;
}

export default function ProjectDetail() {
	const { projectName } = useParams<{ projectName: string }>();
	const [activeTab, setActiveTab] = useState<TabId>('overview');
	const [showLinkModal, setShowLinkModal] = useState(false);
	const [showSyncModal, setShowSyncModal] = useState(false);
	const [syncSource, setSyncSource] = useState<Environment | null>(null);
	const [syncDirection, setSyncDirection] = useState<'push' | 'pull'>('push');
	const queryClient = useQueryClient();

	// Fetch project (for now using comprehensive, later should fetch by ID)
	const { data: projectData, isLoading } = useQuery({
		queryKey: ['project', projectName],
		queryFn: () => dashboardApi.getComprehensiveProjects(),
	});

	const project = (projectData?.data as any[])?.find(
		p => p.project_name === projectName || p.slug === projectName
	);
	const projectId = project?.id;

	// Fetch environments
	const { data: envData, isLoading: envLoading } = useQuery({
		queryKey: ['project-environments', projectId],
		queryFn: () => dashboardApi.getProjectEnvironments(projectId),
		enabled: !!projectId,
	});
	const environments = (envData?.data || []) as Environment[];

	// Fetch Drive settings
	const { data: driveData } = useQuery({
		queryKey: ['project-drive', projectId],
		queryFn: () => dashboardApi.getProjectDriveSettings(projectId),
		enabled: !!projectId,
	});
	const driveSettings = driveData?.data;

	// Drive settings state
	const [driveForm, setDriveForm] = useState({
		gdrive_backups_folder_id: '',
		gdrive_assets_folder_id: '',
		gdrive_docs_folder_id: '',
	});
	const [showDriveForm, setShowDriveForm] = useState(false);

	// Fetch plugins
	const { data: pluginsData } = useQuery({
		queryKey: ['plugins', projectName],
		queryFn: () => dashboardApi.getProjectPlugins(projectName!),
		enabled: !!projectName && activeTab === 'plugins',
	});

	// Action mutations
	const actionMutation = useMutation({
		mutationFn: ({ action }: { action: string }) =>
			dashboardApi.executeProjectAction(projectName!, action),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['project', projectName] });
			toast.success('Action executed successfully');
		},
		onError: () => toast.error('Action failed'),
	});

	// Unlink environment mutation
	const unlinkMutation = useMutation({
		mutationFn: (envId: number) =>
			dashboardApi.unlinkEnvironment(projectId, envId),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['project-environments', projectId],
			});
			toast.success('Environment unlinked');
		},
		onError: () => toast.error('Failed to unlink environment'),
	});

	// Drive settings mutation
	const driveMutation = useMutation({
		mutationFn: (settings: any) =>
			dashboardApi.updateProjectDriveSettings(projectId, settings),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['project-drive', projectId] });
			toast.success('Drive settings saved');
			setShowDriveForm(false);
		},
		onError: () => toast.error('Failed to save Drive settings'),
	});

	// Security scan state
	const [securityScanResult, setSecurityScanResult] =
		useState<SecurityScanResult | null>(null);
	const [isScanning, setIsScanning] = useState(false);

	// Security scan mutation
	const runSecurityScan = async () => {
		if (!projectId) return;
		setIsScanning(true);
		try {
			const response = await api.runSecurityScan(projectId);
			setSecurityScanResult(response.data);
			toast.success('Security scan completed');
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Security scan failed');
		} finally {
			setIsScanning(false);
		}
	};

	// Composer update state and handler
	const [isUpdatingComposer, setIsUpdatingComposer] = useState(false);

	const runComposerUpdate = async () => {
		if (!projectName) return;
		setIsUpdatingComposer(true);
		try {
			const response = await api.runComposerUpdate(projectName);
			if (response.data.status === 'success') {
				toast.success(
					`Composer update completed! ${
						response.data.packages_updated || 0
					} packages updated.`
				);
			} else {
				toast.error(response.data.message || 'Composer update failed');
			}
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Composer update failed');
		} finally {
			setIsUpdatingComposer(false);
		}
	};

	// Backup restore handler
	const [restoringBackupId, setRestoringBackupId] = useState<number | null>(
		null
	);

	const handleRestoreBackup = async (backupId: number, backupName: string) => {
		if (
			!window.confirm(
				`Are you sure you want to restore from "${backupName}"? This will overwrite your current local data.`
			)
		) {
			return;
		}

		setRestoringBackupId(backupId);
		try {
			await api.restoreBackupById(backupId, 'local');
			toast.success('Restore started! This may take a few minutes.');
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Restore failed');
		} finally {
			setRestoringBackupId(null);
		}
	};

	// Fetch backups
	const { data: backupsData } = useQuery({
		queryKey: ['project-backups', projectId],
		queryFn: () => dashboardApi.getProjectBackups(projectId),
		enabled: !!projectId && activeTab === 'backups',
	});
	const backups = (backupsData?.data || []) as any[];

	const handleUnlink = (envId: number, envName: string) => {
		if (
			window.confirm(
				`Unlink ${envName} environment? This won't delete the server data.`
			)
		) {
			unlinkMutation.mutate(envId);
		}
	};

	const handleSaveDrive = () => {
		driveMutation.mutate(driveForm);
	};

	const handleSync = (sourceEnv: Environment, direction: 'push' | 'pull') => {
		setSyncSource(sourceEnv);
		setSyncDirection(direction);
		setShowSyncModal(true);
	};

	const tabs = [
		{ id: 'overview' as TabId, label: 'Overview', icon: Globe },
		{
			id: 'environments' as TabId,
			label: 'Environments',
			icon: Server,
			badge: environments.length,
		},
		{ id: 'plugins' as TabId, label: 'Plugins & Themes', icon: Package },
		{ id: 'backups' as TabId, label: 'Backups', icon: Archive },
		{ id: 'security' as TabId, label: 'Security', icon: Shield },
		{ id: 'git' as TabId, label: 'Git', icon: GitBranch },
	];

	const getEnvColor = (env: string) => {
		switch (env) {
			case 'production':
				return {
					bg: 'bg-green-100',
					text: 'text-green-700',
					border: 'border-green-300',
					icon: '🟢',
				};
			case 'staging':
				return {
					bg: 'bg-yellow-100',
					text: 'text-yellow-700',
					border: 'border-yellow-300',
					icon: '🟡',
				};
			case 'development':
				return {
					bg: 'bg-blue-100',
					text: 'text-blue-700',
					border: 'border-blue-300',
					icon: '🔵',
				};
			default:
				return {
					bg: 'bg-gray-100',
					text: 'text-gray-700',
					border: 'border-gray-300',
					icon: '⚪',
				};
		}
	};

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
			</div>
		);
	}

	if (!project) {
		return (
			<div className='text-center py-12'>
				<AlertTriangle className='w-12 h-12 mx-auto mb-3 text-yellow-500' />
				<h3 className='text-lg font-medium text-gray-900'>Project Not Found</h3>
				<Link
					to='/projects'
					className='mt-4 inline-flex items-center text-blue-600 hover:underline'
				>
					<ArrowLeft className='w-4 h-4 mr-2' />
					Back to Projects
				</Link>
			</div>
		);
	}

	const ddevRunning = project.environments?.local?.ddev_status === 'running';

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center space-x-4'>
					<Link to='/projects' className='text-gray-500 hover:text-gray-700'>
						<ArrowLeft className='w-5 h-5' />
					</Link>
					<div>
						<h1 className='text-2xl font-bold text-gray-900'>
							{project.project_name || project.name}
						</h1>
						<p className='text-sm text-gray-500'>
							{project.directory || project.domain}
						</p>
					</div>
					<Badge variant={project.status === 'active' ? 'success' : 'warning'}>
						{project.status}
					</Badge>
				</div>
				<div className='flex items-center space-x-3'>
					{project.wp_home && (
						<a href={project.wp_home} target='_blank' rel='noopener noreferrer'>
							<Button variant='secondary'>
								<ExternalLink className='w-4 h-4 mr-2' />
								Open Site
							</Button>
						</a>
					)}
					<Button variant='secondary'>
						<Settings className='w-4 h-4 mr-2' />
						Settings
					</Button>
				</div>
			</div>

			{/* Quick Actions */}
			<Card>
				<div className='flex items-center justify-between'>
					<h3 className='font-medium text-gray-900'>Quick Actions</h3>
					<div className='flex items-center space-x-2'>
						<Button
							variant='secondary'
							size='sm'
							onClick={() =>
								actionMutation.mutate({
									action: ddevRunning ? 'stop_ddev' : 'start_ddev',
								})
							}
							disabled={actionMutation.isPending}
						>
							{ddevRunning ? (
								<Pause className='w-4 h-4 mr-1' />
							) : (
								<Play className='w-4 h-4 mr-1' />
							)}
							{ddevRunning ? 'Stop DDEV' : 'Start DDEV'}
						</Button>
						<Button
							variant='secondary'
							size='sm'
							onClick={() => actionMutation.mutate({ action: 'git_pull' })}
							disabled={actionMutation.isPending}
						>
							<RefreshCw className='w-4 h-4 mr-1' />
							Git Pull
						</Button>
						<Button
							variant='secondary'
							size='sm'
							onClick={runComposerUpdate}
							disabled={isUpdatingComposer || actionMutation.isPending}
						>
							{isUpdatingComposer ? (
								<RefreshCw className='w-4 h-4 mr-1 animate-spin' />
							) : (
								<Package className='w-4 h-4 mr-1' />
							)}
							{isUpdatingComposer ? 'Updating...' : 'Composer Update'}
						</Button>
						<Button
							variant='secondary'
							size='sm'
							onClick={() => actionMutation.mutate({ action: 'backup' })}
							disabled={actionMutation.isPending}
						>
							<Archive className='w-4 h-4 mr-1' />
							Backup
						</Button>
					</div>
				</div>
			</Card>

			{/* Tabs */}
			<div className='border-b border-gray-200'>
				<nav className='flex space-x-8'>
					{tabs.map(tab => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`flex items-center px-1 py-4 border-b-2 font-medium text-sm ${
								activeTab === tab.id
									? 'border-blue-500 text-blue-600'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
							}`}
						>
							<tab.icon className='w-4 h-4 mr-2' />
							{tab.label}
							{tab.badge !== undefined && tab.badge > 0 && (
								<span className='ml-2 px-2 py-0.5 text-xs bg-gray-100 rounded-full'>
									{tab.badge}
								</span>
							)}
						</button>
					))}
				</nav>
			</div>

			{/* Tab Content */}
			{activeTab === 'overview' && (
				<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
					{/* Environment */}
					<Card title='Local Environment'>
						<div className='space-y-4'>
							<div className='flex justify-between'>
								<span className='text-gray-500'>DDEV Status</span>
								<Badge variant={ddevRunning ? 'success' : 'warning'}>
									{project.environments?.local?.ddev_status || 'unknown'}
								</Badge>
							</div>
							<div className='flex justify-between'>
								<span className='text-gray-500'>WordPress Version</span>
								<span>
									{project.environments?.local?.wordpress_version || 'N/A'}
								</span>
							</div>
							<div className='flex justify-between'>
								<span className='text-gray-500'>PHP Version</span>
								<span>{project.environments?.local?.php_version || 'N/A'}</span>
							</div>
							<div className='flex justify-between'>
								<span className='text-gray-500'>Health Score</span>
								<span
									className={
										project.health_score >= 80
											? 'text-green-600'
											: 'text-yellow-600'
									}
								>
									{project.health_score}%
								</span>
							</div>
						</div>
					</Card>

					{/* Integrations */}
					<Card title='Integrations'>
						<div className='space-y-4'>
							{/* GitHub */}
							<div className='flex items-center justify-between'>
								<div className='flex items-center'>
									<Github className='w-5 h-5 mr-2 text-gray-400' />
									<span>GitHub</span>
								</div>
								<Badge
									variant={project.github?.connected ? 'success' : 'default'}
								>
									{project.github?.connected ? 'Connected' : 'Not Connected'}
								</Badge>
							</div>

							{/* Google Drive */}
							<div className='border-t pt-4'>
								<div className='flex items-center justify-between mb-3'>
									<div className='flex items-center'>
										<Cloud className='w-5 h-5 mr-2 text-gray-400' />
										<span>Google Drive</span>
									</div>
									<div className='flex items-center space-x-2'>
										<Badge
											variant={
												driveSettings?.gdrive_connected ? 'success' : 'default'
											}
										>
											{driveSettings?.gdrive_connected
												? 'Connected'
												: 'Not Connected'}
										</Badge>
										<button
											onClick={() => {
												setDriveForm({
													gdrive_backups_folder_id:
														driveSettings?.gdrive_backups_folder_id || '',
													gdrive_assets_folder_id:
														driveSettings?.gdrive_assets_folder_id || '',
													gdrive_docs_folder_id:
														driveSettings?.gdrive_docs_folder_id || '',
												});
												setShowDriveForm(!showDriveForm);
											}}
											className='text-sm text-primary-600 hover:underline'
										>
											{showDriveForm ? 'Cancel' : 'Configure'}
										</button>
									</div>
								</div>

								{/* Drive Settings Form */}
								{showDriveForm && (
									<div className='mt-4 p-4 bg-gray-50 rounded-lg space-y-3'>
										<div>
											<label className='block text-xs font-medium text-gray-600 mb-1'>
												Backups Folder ID
											</label>
											<input
												type='text'
												value={driveForm.gdrive_backups_folder_id}
												onChange={e =>
													setDriveForm(prev => ({
														...prev,
														gdrive_backups_folder_id: e.target.value,
													}))
												}
												placeholder='e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
												className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
											/>
											<p className='text-xs text-gray-500 mt-1'>
												Where backups will be stored
											</p>
										</div>
										<div>
											<label className='block text-xs font-medium text-gray-600 mb-1'>
												Assets Folder ID (optional)
											</label>
											<input
												type='text'
												value={driveForm.gdrive_assets_folder_id}
												onChange={e =>
													setDriveForm(prev => ({
														...prev,
														gdrive_assets_folder_id: e.target.value,
													}))
												}
												placeholder='Folder ID for project assets'
												className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
											/>
										</div>
										<div>
											<label className='block text-xs font-medium text-gray-600 mb-1'>
												Docs Folder ID (optional)
											</label>
											<input
												type='text'
												value={driveForm.gdrive_docs_folder_id}
												onChange={e =>
													setDriveForm(prev => ({
														...prev,
														gdrive_docs_folder_id: e.target.value,
													}))
												}
												placeholder='Folder ID for documentation'
												className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
											/>
										</div>
										<div className='flex justify-end pt-2'>
											<Button
												variant='primary'
												size='sm'
												onClick={handleSaveDrive}
												disabled={driveMutation.isPending}
											>
												{driveMutation.isPending
													? 'Saving...'
													: 'Save Drive Settings'}
											</Button>
										</div>
									</div>
								)}

								{/* Current folders display */}
								{!showDriveForm && driveSettings?.gdrive_connected && (
									<div className='text-xs text-gray-500 space-y-1'>
										{driveSettings.gdrive_backups_folder_id && (
											<div>
												📁 Backups:{' '}
												{driveSettings.gdrive_backups_folder_id.substring(
													0,
													20
												)}
												...
											</div>
										)}
										{driveSettings.gdrive_assets_folder_id && (
											<div>
												📁 Assets:{' '}
												{driveSettings.gdrive_assets_folder_id.substring(0, 20)}
												...
											</div>
										)}
									</div>
								)}
							</div>
						</div>
					</Card>
				</div>
			)}

			{activeTab === 'environments' && (
				<div className='space-y-6'>
					{/* Header */}
					<div className='flex items-center justify-between'>
						<div>
							<h2 className='text-lg font-semibold text-gray-900'>
								Server Environments
							</h2>
							<p className='text-sm text-gray-500'>
								Staging and production deployments
							</p>
						</div>
						<Button variant='primary' onClick={() => setShowLinkModal(true)}>
							<Plus className='w-4 h-4 mr-2' />
							Link Environment
						</Button>
					</div>

					{/* Environments Grid */}
					{envLoading ? (
						<div className='flex justify-center py-12'>
							<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
						</div>
					) : environments.length === 0 ? (
						<Card>
							<div className='text-center py-12'>
								<Server className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<h3 className='text-lg font-medium text-gray-900'>
									No Environments Linked
								</h3>
								<p className='mt-2 text-gray-500'>
									Link staging and production servers to enable sync and backup.
								</p>
								<Button
									variant='primary'
									className='mt-4'
									onClick={() => setShowLinkModal(true)}
								>
									<Plus className='w-4 h-4 mr-2' />
									Link First Environment
								</Button>
							</div>
						</Card>
					) : (
						<div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
							{environments.map(env => {
								const colors = getEnvColor(env.environment);
								return (
									<Card key={env.id} className={`border-2 ${colors.border}`}>
										<div className='space-y-4'>
											{/* Header */}
											<div className='flex items-start justify-between'>
												<div>
													<div
														className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colors.bg} ${colors.text}`}
													>
														{colors.icon} {env.environment.toUpperCase()}
													</div>
													<p className='mt-2 text-sm text-gray-500'>
														{env.server_name}
													</p>
												</div>
												<button
													onClick={() => handleUnlink(env.id, env.environment)}
													className='p-1 text-gray-400 hover:text-red-500'
													title='Unlink environment'
												>
													<Trash2 className='w-4 h-4' />
												</button>
											</div>

											{/* Details */}
											<div className='space-y-2 text-sm'>
												<div className='flex items-center'>
													<Globe className='w-4 h-4 mr-2 text-gray-400' />
													<a
														href={env.wp_url}
														target='_blank'
														rel='noopener noreferrer'
														className='text-blue-600 hover:underline truncate'
													>
														{env.wp_url}
													</a>
												</div>
												<div className='flex items-center text-gray-500'>
													<Server className='w-4 h-4 mr-2 text-gray-400' />
													<span className='truncate'>{env.wp_path}</span>
												</div>
											</div>

											{/* Actions */}
											<div className='flex items-center justify-between pt-4 border-t'>
												<div className='flex items-center space-x-2'>
													<Button
														variant='secondary'
														size='sm'
														title='Open WP Admin'
														onClick={() =>
															window.open(`${env.wp_url}/wp-admin`, '_blank')
														}
													>
														<ExternalLink className='w-4 h-4 mr-1' />
														WP Admin
													</Button>
													{env.environment === 'staging' &&
														environments.some(
															e => e.environment === 'production'
														) && (
															<Button
																variant='secondary'
																size='sm'
																title='Sync to Production'
																onClick={() => handleSync(env, 'push')}
															>
																<ArrowRight className='w-4 h-4 mr-1' />
																Push
															</Button>
														)}
													{env.environment === 'production' &&
														environments.some(
															e => e.environment === 'staging'
														) && (
															<Button
																variant='secondary'
																size='sm'
																title='Sync to Staging'
																onClick={() => handleSync(env, 'pull')}
															>
																<ArrowLeft className='w-4 h-4 mr-1' />
																Clone
															</Button>
														)}
												</div>
												<Button variant='secondary' size='sm'>
													<Archive className='w-4 h-4 mr-1' />
													Backup
												</Button>
											</div>
										</div>
									</Card>
								);
							})}
						</div>
					)}

					{/* Sync Actions (when both environments exist) */}
					{environments.length >= 2 && (
						<Card className='bg-gradient-to-r from-yellow-50 to-green-50 border-2 border-dashed border-gray-300'>
							<div className='flex items-center justify-center space-x-6 py-4'>
								<div className='text-center'>
									<span className='text-2xl'>🟡</span>
									<p className='text-sm font-medium'>Staging</p>
								</div>
								<div className='flex items-center space-x-2'>
									<Button
										variant='secondary'
										size='sm'
										onClick={() => {
											const staging = environments.find(
												e => e.environment === 'staging'
											);
											if (staging) handleSync(staging, 'push');
										}}
										title='Sync Staging to Production'
									>
										<ArrowRight className='w-4 h-4' />
									</Button>
									<ArrowLeftRight className='w-5 h-5 text-gray-400' />
									<Button
										variant='secondary'
										size='sm'
										onClick={() => {
											const production = environments.find(
												e => e.environment === 'production'
											);
											if (production) handleSync(production, 'pull');
										}}
										title='Sync Production to Staging'
									>
										<ArrowLeft className='w-4 h-4' />
									</Button>
								</div>
								<div className='text-center'>
									<span className='text-2xl'>🟢</span>
									<p className='text-sm font-medium'>Production</p>
								</div>
							</div>
							<p className='text-xs text-center text-gray-500 mt-2'>
								Click arrows to sync between environments
							</p>
						</Card>
					)}
				</div>
			)}

			{activeTab === 'plugins' && (
				<Card title='Plugins'>
					{pluginsData?.data?.plugins?.length > 0 ? (
						<div className='divide-y'>
							{pluginsData.data.plugins.map((plugin: any) => (
								<div
									key={plugin.name}
									className='py-3 flex items-center justify-between'
								>
									<div>
										<p className='font-medium'>{plugin.name}</p>
										<p className='text-sm text-gray-500'>v{plugin.version}</p>
									</div>
									<Badge
										variant={plugin.status === 'active' ? 'success' : 'default'}
									>
										{plugin.status}
									</Badge>
								</div>
							))}
						</div>
					) : (
						<p className='text-gray-500'>No plugins found</p>
					)}
				</Card>
			)}

			{activeTab === 'backups' && (
				<div className='space-y-6'>
					{/* Backup Actions */}
					<div className='flex items-center justify-between'>
						<div>
							<h2 className='text-lg font-semibold text-gray-900'>
								Backup History
							</h2>
							<p className='text-sm text-gray-500'>
								Point-in-time recovery available
							</p>
						</div>
						<Button
							variant='primary'
							onClick={() => actionMutation.mutate({ action: 'backup' })}
						>
							<Plus className='w-4 h-4 mr-2' />
							Create Backup
						</Button>
					</div>

					{/* Backup Timeline */}
					{backups.length > 0 ? (
						<div className='relative'>
							<div className='absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200' />
							<div className='space-y-4'>
								{backups.map((backup: any, index: number) => (
									<div
										key={backup.id}
										className='relative flex items-start pl-10'
									>
										<div
											className={`absolute left-2 w-5 h-5 rounded-full flex items-center justify-center ${
												backup.status === 'completed'
													? 'bg-green-100 text-green-600'
													: backup.status === 'failed'
													? 'bg-red-100 text-red-600'
													: 'bg-gray-100 text-gray-400'
											}`}
										>
											{backup.status === 'completed' ? (
												<CheckCircle className='w-3 h-3' />
											) : backup.status === 'failed' ? (
												<XCircle className='w-3 h-3' />
											) : (
												<Clock className='w-3 h-3' />
											)}
										</div>
										<Card className='flex-1'>
											<div className='flex items-center justify-between'>
												<div>
													<h4 className='font-medium text-gray-900'>
														{backup.name || `Backup #${backup.id}`}
													</h4>
													<p className='text-sm text-gray-500'>
														{new Date(backup.created_at).toLocaleString()}
														{backup.size_bytes &&
															` • ${(backup.size_bytes / 1024 / 1024).toFixed(
																1
															)} MB`}
													</p>
												</div>
												<div className='flex items-center space-x-2'>
													<Badge
														variant={
															backup.storage_type === 'gdrive' ||
															backup.storage_type === 'google_drive'
																? 'info'
																: 'default'
														}
													>
														{backup.storage_type === 'gdrive' ||
														backup.storage_type === 'google_drive'
															? 'Google Drive'
															: 'Local'}
													</Badge>
													<Button variant='ghost' size='sm' title='Download'>
														<Download className='w-4 h-4' />
													</Button>
													<Button
														variant='ghost'
														size='sm'
														title='Restore'
														onClick={() =>
															handleRestoreBackup(
																backup.id,
																backup.name || `Backup #${backup.id}`
															)
														}
														disabled={restoringBackupId === backup.id}
													>
														{restoringBackupId === backup.id ? (
															<RefreshCw className='w-4 h-4 animate-spin' />
														) : (
															<RotateCcw className='w-4 h-4' />
														)}
													</Button>
												</div>
											</div>
										</Card>
									</div>
								))}
							</div>
						</div>
					) : (
						<Card>
							<div className='text-center py-12'>
								<Archive className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<h3 className='text-lg font-medium text-gray-900'>
									No Backups Yet
								</h3>
								<p className='mt-2 text-gray-500'>
									Create your first backup to enable point-in-time recovery.
								</p>
								<Button
									variant='primary'
									className='mt-4'
									onClick={() => actionMutation.mutate({ action: 'backup' })}
								>
									<Plus className='w-4 h-4 mr-2' />
									Create First Backup
								</Button>
							</div>
						</Card>
					)}
				</div>
			)}

			{activeTab === 'git' && (
				<Card title='Git History'>
					<p className='text-gray-500'>
						Git commits and history will appear here
					</p>
				</Card>
			)}

			{activeTab === 'security' && (
				<div className='space-y-6'>
					{/* Security Scan Header */}
					<div className='flex items-center justify-between'>
						<div>
							<h2 className='text-lg font-semibold text-gray-900'>
								Security Scan
							</h2>
							<p className='text-sm text-gray-500'>
								Analyze your site for common security issues
							</p>
						</div>
						<Button
							variant='primary'
							onClick={runSecurityScan}
							disabled={isScanning}
						>
							{isScanning ? (
								<>
									<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
									Scanning...
								</>
							) : (
								<>
									<Shield className='w-4 h-4 mr-2' />
									Run Security Scan
								</>
							)}
						</Button>
					</div>

					{/* Scan Results */}
					{securityScanResult ? (
						<div className='space-y-6'>
							{/* Score Card */}
							<Card>
								<div className='flex items-center justify-between'>
									<div className='flex items-center space-x-4'>
										<div
											className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
												securityScanResult.overall_status === 'pass'
													? 'bg-green-100 text-green-700'
													: securityScanResult.overall_status === 'warn'
													? 'bg-yellow-100 text-yellow-700'
													: 'bg-red-100 text-red-700'
											}`}
										>
											{securityScanResult.score}
										</div>
										<div>
											<h3 className='text-xl font-semibold text-gray-900'>
												Security Score: {securityScanResult.score}/100
											</h3>
											<p className='text-sm text-gray-500'>
												Scanned at{' '}
												{new Date(
													securityScanResult.scanned_at
												).toLocaleString()}
											</p>
										</div>
									</div>
									<div className='flex items-center space-x-4'>
										<div className='text-center'>
											<div className='text-2xl font-bold text-green-600'>
												{securityScanResult.summary.pass}
											</div>
											<div className='text-xs text-gray-500'>Passed</div>
										</div>
										<div className='text-center'>
											<div className='text-2xl font-bold text-yellow-600'>
												{securityScanResult.summary.warn}
											</div>
											<div className='text-xs text-gray-500'>Warnings</div>
										</div>
										<div className='text-center'>
											<div className='text-2xl font-bold text-red-600'>
												{securityScanResult.summary.fail}
											</div>
											<div className='text-xs text-gray-500'>Failed</div>
										</div>
									</div>
								</div>
							</Card>

							{/* Check Results */}
							<Card title='Security Checks'>
								<div className='divide-y'>
									{securityScanResult.checks.map((check, index) => (
										<div key={index} className='py-4 first:pt-0 last:pb-0'>
											<div className='flex items-start justify-between'>
												<div className='flex items-start space-x-3'>
													<div
														className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center ${
															check.status === 'pass'
																? 'bg-green-100 text-green-600'
																: check.status === 'warn'
																? 'bg-yellow-100 text-yellow-600'
																: 'bg-red-100 text-red-600'
														}`}
													>
														{check.status === 'pass' ? (
															<CheckCircle className='w-4 h-4' />
														) : check.status === 'warn' ? (
															<AlertCircle className='w-4 h-4' />
														) : (
															<XCircle className='w-4 h-4' />
														)}
													</div>
													<div>
														<h4 className='font-medium text-gray-900'>
															{check.name}
														</h4>
														<p className='text-sm text-gray-600 mt-0.5'>
															{check.message}
														</p>
														{check.details &&
															Object.keys(check.details).length > 0 && (
																<div className='mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded'>
																	{Object.entries(check.details).map(
																		([key, value]) => (
																			<div key={key}>
																				<span className='font-medium'>
																					{key}:
																				</span>{' '}
																				{String(value)}
																			</div>
																		)
																	)}
																</div>
															)}
													</div>
												</div>
												<Badge
													variant={
														check.severity === 'critical' ||
														check.severity === 'high'
															? 'danger'
															: check.severity === 'medium'
															? 'warning'
															: 'default'
													}
												>
													{check.severity}
												</Badge>
											</div>
										</div>
									))}
								</div>
							</Card>
						</div>
					) : (
						<Card>
							<div className='text-center py-12'>
								<Shield className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<h3 className='text-lg font-medium text-gray-900'>
									No Scan Results
								</h3>
								<p className='mt-2 text-gray-500'>
									Run a security scan to analyze your site for vulnerabilities.
								</p>
								<Button
									variant='primary'
									className='mt-4'
									onClick={runSecurityScan}
									disabled={isScanning}
								>
									{isScanning ? (
										<>
											<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
											Scanning...
										</>
									) : (
										<>
											<Shield className='w-4 h-4 mr-2' />
											Run First Scan
										</>
									)}
								</Button>
							</div>
						</Card>
					)}
				</div>
			)}

			{/* Link Environment Modal */}
			{projectId && (
				<LinkEnvironmentModal
					projectId={projectId}
					projectName={project.project_name || project.name}
					isOpen={showLinkModal}
					onClose={() => setShowLinkModal(false)}
					existingEnvironments={environments.map(e => e.environment)}
				/>
			)}

			{/* Sync Modal */}
			{projectId && (
				<SyncModal
					isOpen={showSyncModal}
					onClose={() => {
						setShowSyncModal(false);
						setSyncSource(null);
					}}
					projectId={projectId}
					projectName={project?.project_name || project?.name || ''}
					environments={environments}
					initialSource={syncSource || undefined}
					initialDirection={syncDirection}
				/>
			)}
		</div>
	);
}
