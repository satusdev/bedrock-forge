import React, {
	useState,
	useEffect,
	useMemo,
	useCallback,
	useRef,
} from 'react';
import { useSearchParams } from '@/router/compat';
import {
	Database,
	Cloud,
	HardDrive,
	Plus,
	RefreshCw,
	Loader2,
	Filter,
} from 'lucide-react';
import { dashboardApi, getApiErrorMessage } from '../services/api';
import { Backup, BackupType, BackupStorageType, BackupStatus } from '../types';
import toast from 'react-hot-toast';
import TaskLogModal from '../components/TaskLogModal';
import DataTable from '@/components/ui/DataTable';
import Badge from '../components/ui/Badge';
import { createBackupsColumns } from '@/pages/backups/columns';
import { useTaskStatusPolling } from '../hooks/useTaskStatusPolling';
import websocketService, { WebSocketMessage } from '@/services/websocket';

interface Project {
	id: number;
	name: string;
}

interface Environment {
	id: number;
	environment: string;
	server_id: number;
	server_name: string;
	wp_url?: string;
}

const Backups: React.FC = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const [backups, setBackups] = useState<Backup[]>([]);
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState<number | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [restoreBackup, setRestoreBackup] = useState<Backup | null>(null);
	const [restoreConfirmText, setRestoreConfirmText] = useState('');
	const [restoreTaskId, setRestoreTaskId] = useState<string | null>(null);
	const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
	const [restoreMessage, setRestoreMessage] = useState<string>('');
	const [restoreProgress, setRestoreProgress] = useState<number>(0);

	// Logs Modal State
	const [logModal, setLogModal] = useState<{
		isOpen: boolean;
		backupId: number;
		backupName: string;
		isRunning: boolean;
	}>({
		isOpen: false,
		backupId: 0,
		backupName: '',
		isRunning: false,
	});

	// Filters
	const [filterProjectId, setFilterProjectId] = useState<number | undefined>();
	const [filterBackupType, setFilterBackupType] = useState<
		BackupType | undefined
	>();

	// Form state
	const [formData, setFormData] = useState({
		project_id: 0,
		environment_id: 0,
		backup_type: 'full' as BackupType,
		storage_type: 'google_drive' as BackupStorageType,
		name: '',
	});

	// Environments for selected project in modal
	const [environments, setEnvironments] = useState<Environment[]>([]);
	const [loadingEnvironments, setLoadingEnvironments] = useState(false);

	// Stats
	const [stats, setStats] = useState({
		total: 0,
		totalSize: 0,
		googleDriveCount: 0,
		localCount: 0,
	});
	const [tableFilter, setTableFilter] = useState('');
	const [wsConnected, setWsConnected] = useState(false);
	const refreshTimeoutRef = useRef<number | null>(null);

	const selectedProject = useMemo(() => {
		if (!filterProjectId) return null;
		return projects.find(project => project.id === filterProjectId) || null;
	}, [filterProjectId, projects]);

	useEffect(() => {
		fetchBackups();
		fetchProjects();
	}, [filterProjectId, filterBackupType]);

	const { taskStatus: restoreTaskStatus } = useTaskStatusPolling(
		restoreTaskId,
		{
			onComplete: status => {
				setRestoreStatus(status.status || 'unknown');
				setRestoreMessage(status.message || '');
				setRestoreProgress(status.progress || 0);
			},
		},
	);

	useEffect(() => {
		if (!restoreTaskStatus) return;
		setRestoreStatus(restoreTaskStatus.status || 'unknown');
		setRestoreMessage(restoreTaskStatus.message || '');
		setRestoreProgress(restoreTaskStatus.progress || 0);
	}, [restoreTaskStatus]);

	useEffect(() => {
		const projectParam = searchParams.get('project_id');
		if (!projectParam) return;
		const projectId = Number(projectParam);
		if (Number.isNaN(projectId)) return;
		setFilterProjectId(projectId);
		setFormData(prev => ({
			...prev,
			project_id: projectId,
		}));
	}, [searchParams]);

	const fetchBackups = useCallback(
		async (showLoader = true) => {
			try {
				if (showLoader) {
					setLoading(true);
				}
				const response = await dashboardApi.getBackups({
					project_id: filterProjectId,
					backup_type: filterBackupType,
				});
				// Handle both list response formats
				const backupList = response.data.items || response.data || [];
				setBackups(backupList);

				// Calculate stats
				const totalSize = backupList.reduce(
					(acc: number, b: Backup) => acc + (b.size_bytes || 0),
					0,
				);
				const googleDriveCount = backupList.filter(
					(b: Backup) => b.storage_type === 'google_drive',
				).length;
				const localCount = backupList.filter(
					(b: Backup) => b.storage_type === 'local',
				).length;

				setStats({
					total: backupList.length,
					totalSize,
					googleDriveCount,
					localCount,
				});
			} catch (error) {
				console.error('Failed to fetch backups:', error);
				toast.error('Failed to load backups');
			} finally {
				if (showLoader) {
					setLoading(false);
				}
			}
		},
		[filterProjectId, filterBackupType],
	);

	const hasActiveBackups = useMemo(
		() =>
			backups.some(backup => {
				const status = String(backup.status || '').toLowerCase();
				return (
					status === 'pending' ||
					status === 'running' ||
					status === 'in_progress'
				);
			}),
		[backups],
	);

	useEffect(() => {
		const handleConnection = (message: WebSocketMessage) => {
			if (message.type !== 'connection') {
				return;
			}
			setWsConnected(message.status === 'connected');
		};

		const handleBackupUpdate = (message: WebSocketMessage) => {
			if (message.type !== 'backup_update') {
				return;
			}

			if (refreshTimeoutRef.current) {
				window.clearTimeout(refreshTimeoutRef.current);
			}

			refreshTimeoutRef.current = window.setTimeout(() => {
				void fetchBackups(false);
			}, 300);
		};

		websocketService.on('connection', handleConnection);
		websocketService.on('backup_update', handleBackupUpdate);
		void websocketService.connect().then(() => {
			setWsConnected(websocketService.isConnected());
		});

		return () => {
			websocketService.off('connection', handleConnection);
			websocketService.off('backup_update', handleBackupUpdate);
			if (refreshTimeoutRef.current) {
				window.clearTimeout(refreshTimeoutRef.current);
				refreshTimeoutRef.current = null;
			}
		};
	}, [fetchBackups]);

	useEffect(() => {
		if (!hasActiveBackups || wsConnected) {
			return;
		}

		const intervalId = window.setInterval(() => {
			void fetchBackups(false);
		}, 5000);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [hasActiveBackups, wsConnected, fetchBackups]);

	const fetchProjects = async () => {
		try {
			const response = await dashboardApi.getRemoteProjects();
			// Ensure we get an array
			const data = response.data;
			const projectList = Array.isArray(data) ? data : data?.items || [];
			setProjects(projectList);
		} catch (error) {
			console.error('Failed to fetch projects:', error);
			setProjects([]);
		}
	};

	const fetchEnvironments = async (projectId: number) => {
		if (!projectId) {
			setEnvironments([]);
			return;
		}
		try {
			setLoadingEnvironments(true);
			const response = await dashboardApi.getProjectServers(projectId);
			setEnvironments(response.data || []);
		} catch (error) {
			console.error('Failed to fetch environments:', error);
			setEnvironments([]);
		} finally {
			setLoadingEnvironments(false);
		}
	};

	const clearProjectFilter = () => {
		setFilterProjectId(undefined);
		setFormData(prev => ({
			...prev,
			project_id: 0,
			environment_id: 0,
		}));
		setEnvironments([]);
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete('project_id');
		setSearchParams(nextParams);
	};

	const handleCreateBackup = async () => {
		if (!formData.project_id) {
			toast.error('Please select a project');
			return;
		}

		if (environments.length > 0 && !formData.environment_id) {
			toast.error('Please select an environment');
			return;
		}

		try {
			setActionLoading(-1);
			await dashboardApi.createManualBackup({
				project_id: formData.project_id,
				environment_id: formData.environment_id || undefined,
				backup_type: formData.backup_type,
				storage_type: formData.storage_type,
				name: formData.name || undefined,
			});
			toast.success('Backup started successfully');
			setShowCreateModal(false);
			setFormData({
				project_id: 0,
				environment_id: 0,
				backup_type: 'full',
				storage_type: 'google_drive',
				name: '',
			});
			setEnvironments([]);
			fetchBackups();
		} catch (error) {
			console.error('Failed to create backup:', error);
			toast.error(getApiErrorMessage(error, 'Failed to create backup'));
		} finally {
			setActionLoading(null);
		}
	};

	const handleDeleteBackup = async (backup: Backup) => {
		if (!confirm('Are you sure you want to delete this backup?')) return;

		try {
			setActionLoading(backup.id);
			const status = String(backup.status || '').toLowerCase();
			const isDrive =
				backup.storage_type?.toLowerCase() === 'google_drive' ||
				backup.storage_type?.toLowerCase() === 'gdrive';
			const deleteFile = !isDrive || Boolean(backup.drive_folder_id);
			const force =
				['running', 'pending', 'failed'].includes(status) ||
				(isDrive && !backup.drive_folder_id);
			await dashboardApi.deleteBackup(backup.id, {
				force,
				delete_file: deleteFile,
			});
			toast.success('Backup deleted');
			fetchBackups();
		} catch (error) {
			console.error('Failed to delete backup:', error);
			toast.error(getApiErrorMessage(error, 'Failed to delete backup'));
		} finally {
			setActionLoading(null);
		}
	};

	const openRestoreModal = (backup: Backup) => {
		setRestoreBackup(backup);
		setRestoreConfirmText('');
		setRestoreTaskId(null);
		setRestoreStatus(null);
		setRestoreMessage('');
		setRestoreProgress(0);
	};

	const handleRestore = async () => {
		if (!restoreBackup) return;
		const requiredText = restoreBackup.project_name || restoreBackup.name;
		if (!requiredText || restoreConfirmText.trim() !== requiredText) {
			toast.error('Please type the exact project name to confirm');
			return;
		}
		try {
			setActionLoading(restoreBackup.id);
			const response = await dashboardApi.restoreBackupFile(restoreBackup.id);
			setRestoreTaskId(response.data.task_id || null);
			setRestoreStatus('pending');
			setRestoreMessage(response.data.message || 'Restore started');
			toast.success('Restore initiated');
		} catch (error) {
			console.error('Failed to restore backup:', error);
			toast.error(getApiErrorMessage(error, 'Failed to restore backup'));
		} finally {
			setActionLoading(null);
		}
	};

	const columns = useMemo(
		() =>
			createBackupsColumns({
				actionLoading,
				onOpenLogs: backup =>
					setLogModal({
						isOpen: true,
						backupId: backup.id,
						backupName: backup.name,
						isRunning:
							backup.status === 'pending' ||
							backup.status === 'running' ||
							backup.status === 'in_progress',
					}),
				onOpenRestore: openRestoreModal,
				onDelete: handleDeleteBackup,
			}),
		[actionLoading, openRestoreModal, handleDeleteBackup],
	);

	const formatSize = (bytes: number | undefined) => {
		if (!bytes) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}
		return `${size.toFixed(1)} ${units[unitIndex]}`;
	};

	return (
		<div className='space-y-6'>
			<div className='flex justify-between items-center'>
				<h1 className='text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
					<Database className='h-6 w-6 text-indigo-600' />
					Backup Manager
				</h1>
				<div className='flex gap-2'>
					<button
						onClick={() => {
							void fetchBackups();
						}}
						className='p-2 text-gray-500 hover:text-indigo-600 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors'
						title='Refresh'
					>
						<RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
					</button>
					<button
						onClick={() => setShowCreateModal(true)}
						className='px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-colors shadow-sm'
					>
						<Plus className='h-4 w-4' />
						New Backup
					</button>
				</div>
			</div>

			{selectedProject && (
				<div className='flex items-center justify-between bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-4 py-2'>
					<span className='text-sm'>
						Filtered to project: <strong>{selectedProject.name}</strong>
					</span>
					<button
						className='text-sm text-indigo-700 hover:text-indigo-900'
						onClick={clearProjectFilter}
					>
						Clear filter
					</button>
				</div>
			)}

			{/* Stats Cards */}
			<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
				<div className='bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg'>
							<Database className='h-5 w-5 text-indigo-600' />
						</div>
						<div>
							<div className='text-2xl font-bold text-gray-900 dark:text-white'>
								{stats.total}
							</div>
							<div className='text-sm text-gray-500'>Total Backups</div>
						</div>
					</div>
				</div>
				<div className='bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg'>
							<HardDrive className='h-5 w-5 text-blue-600' />
						</div>
						<div>
							<div className='text-2xl font-bold text-gray-900 dark:text-white'>
								{formatSize(stats.totalSize)}
							</div>
							<div className='text-sm text-gray-500'>Total Size</div>
						</div>
					</div>
				</div>
				<div className='bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-green-50 dark:bg-green-900/20 rounded-lg'>
							<Cloud className='h-5 w-5 text-green-600' />
						</div>
						<div>
							<div className='text-2xl font-bold text-gray-900 dark:text-white'>
								{stats.googleDriveCount}
							</div>
							<div className='text-sm text-gray-500'>Google Drive</div>
						</div>
					</div>
				</div>
				<div className='bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg'>
							<HardDrive className='h-5 w-5 text-orange-600' />
						</div>
						<div>
							<div className='text-2xl font-bold text-gray-900 dark:text-white'>
								{stats.localCount}
							</div>
							<div className='text-sm text-gray-500'>Local Storage</div>
						</div>
					</div>
				</div>
			</div>

			{/* Filters */}
			<div className='flex gap-4 items-center'>
				<div className='flex items-center gap-2'>
					<Filter className='h-4 w-4 text-gray-400' />
					<span className='text-sm text-gray-500'>Filter:</span>
				</div>
				<select
					value={filterProjectId !== undefined ? String(filterProjectId) : ''}
					onChange={e => {
						const val = e.target.value;
						setFilterProjectId(val ? parseInt(val, 10) : undefined);
					}}
					className='px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
				>
					<option key='filter-all-projects' value=''>
						All Projects
					</option>
					{projects
						.filter(p => p.id != null)
						.map(project => (
							<option
								key={`filter-project-${project.id}`}
								value={String(project.id)}
							>
								{project.name}
							</option>
						))}
				</select>
				<select
					value={filterBackupType ?? ''}
					onChange={e =>
						setFilterBackupType((e.target.value as BackupType) || undefined)
					}
					className='px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
				>
					<option key='filter-type-all' value=''>
						All Types
					</option>
					<option key='filter-type-full' value='full'>
						Full Backup
					</option>
					<option key='filter-type-database' value='database'>
						Database
					</option>
					<option key='filter-type-files' value='files'>
						Files
					</option>
				</select>
			</div>

			{/* Backups Table */}
			<div className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden'>
				{loading ? (
					<div className='flex items-center justify-center py-16'>
						<Loader2 className='h-8 w-8 animate-spin text-indigo-600' />
					</div>
				) : (
					<DataTable
						columns={columns}
						data={backups}
						filterValue={tableFilter}
						onFilterChange={setTableFilter}
						filterPlaceholder='Filter backups by name, project, status, or storage...'
						emptyMessage='No backups yet.'
						initialPageSize={10}
					/>
				)}
			</div>

			{/* Create Backup Modal */}
			{showCreateModal && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
					<div className='bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full'>
						<div className='p-6 border-b border-gray-100 dark:border-gray-700'>
							<h2 className='text-xl font-bold text-gray-900 dark:text-white'>
								Create New Backup
							</h2>
						</div>

						<div className='p-6 space-y-4'>
							{/* Project */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Project *
								</label>
								<select
									value={formData.project_id || ''}
									onChange={e => {
										const val = e.target.value;
										const projectId = val ? parseInt(val, 10) : 0;
										setFormData({
											...formData,
											project_id: projectId,
											environment_id: 0,
										});
										fetchEnvironments(projectId);
									}}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
								>
									<option key='modal-project-default' value=''>
										Select a project...
									</option>
									{projects
										.filter(p => p.id != null)
										.map(project => (
											<option
												key={`modal-project-${project.id}`}
												value={String(project.id)}
											>
												{project.name}
											</option>
										))}
								</select>
							</div>

							{/* Environment */}
							{formData.project_id > 0 && (
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
										Environment {environments.length > 0 ? '*' : '(optional)'}
									</label>
									{loadingEnvironments ? (
										<div className='flex items-center gap-2 px-3 py-2 text-sm text-gray-500'>
											<Loader2 className='h-4 w-4 animate-spin' />
											Loading environments...
										</div>
									) : environments.length > 0 ? (
										<select
											value={formData.environment_id || ''}
											onChange={e => {
												const val = e.target.value;
												setFormData({
													...formData,
													environment_id: val ? parseInt(val, 10) : 0,
												});
											}}
											className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
										>
											<option key='modal-env-default' value=''>
												Select an environment...
											</option>
											{environments.map(env => (
												<option
													key={`modal-env-${env.id}`}
													value={String(env.id)}
												>
													{env.environment} • {env.server_name}
												</option>
											))}
										</select>
									) : (
										<div className='px-3 py-2 text-sm text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-lg'>
											No linked environments. Backup will use project defaults.
										</div>
									)}
								</div>
							)}

							{/* Backup Type */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Backup Type
								</label>
								<select
									value={formData.backup_type}
									onChange={e =>
										setFormData({
											...formData,
											backup_type: e.target.value as BackupType,
										})
									}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
								>
									<option key='modal-backup-type-full' value='full'>
										Full Backup (Database + Files)
									</option>
									<option key='modal-backup-type-database' value='database'>
										Database Only
									</option>
									<option key='modal-backup-type-files' value='files'>
										Files Only
									</option>
								</select>
							</div>

							{/* Storage Type */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Storage Location
								</label>
								<select
									value={formData.storage_type}
									onChange={e =>
										setFormData({
											...formData,
											storage_type: e.target.value as BackupStorageType,
										})
									}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
								>
									<option key='modal-storage-type-gdrive' value='google_drive'>
										Google Drive
									</option>
									<option key='modal-storage-type-local' value='local'>
										Local Storage
									</option>
									<option key='modal-storage-type-s3' value='s3'>
										AWS S3
									</option>
								</select>
							</div>

							{/* Name (optional) */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Name (optional)
								</label>
								<input
									type='text'
									value={formData.name}
									onChange={e =>
										setFormData({ ...formData, name: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
									placeholder='Auto-generated if empty'
								/>
							</div>
						</div>

						<div className='p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3'>
							<button
								onClick={() => setShowCreateModal(false)}
								className='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
							>
								Cancel
							</button>
							<button
								onClick={handleCreateBackup}
								disabled={actionLoading !== null}
								className='px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2'
							>
								{actionLoading !== null && (
									<Loader2 className='h-4 w-4 animate-spin' />
								)}
								Create Backup
							</button>
						</div>
					</div>
				</div>
			)}

			{restoreBackup && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
					<div className='bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full'>
						<div className='p-6 border-b border-gray-100 dark:border-gray-700'>
							<h2 className='text-xl font-bold text-gray-900 dark:text-white'>
								Confirm Restore
							</h2>
							<p className='mt-2 text-sm text-gray-500'>
								Restoring will overwrite the current environment data.
							</p>
						</div>

						<div className='p-6 space-y-4'>
							<div className='text-sm text-gray-600 dark:text-gray-300'>
								<div className='flex justify-between'>
									<span>Backup</span>
									<span className='font-medium'>{restoreBackup.name}</span>
								</div>
								<div className='flex justify-between mt-1'>
									<span>Project</span>
									<span className='font-medium'>
										{restoreBackup.project_name || 'Unknown'}
									</span>
								</div>
							</div>

							<div className='rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700'>
								Type the project name to confirm this restore.
							</div>

							<input
								type='text'
								value={restoreConfirmText}
								onChange={e => setRestoreConfirmText(e.target.value)}
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
								placeholder={restoreBackup.project_name || 'Project name'}
							/>

							{restoreTaskId && (
								<div className='rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-600 dark:text-gray-300'>
									<div className='flex items-center justify-between'>
										<span>Status</span>
										<Badge variant='secondary'>
											{restoreStatus || 'pending'}
										</Badge>
									</div>
									<p className='mt-2 text-xs text-gray-500'>{restoreMessage}</p>
									{restoreProgress > 0 && (
										<div className='mt-2 w-full bg-gray-200 rounded-full h-2'>
											<div
												className='bg-indigo-600 h-2 rounded-full'
												style={{ width: `${restoreProgress}%` }}
											/>
										</div>
									)}
								</div>
							)}
						</div>

						<div className='p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3'>
							<button
								onClick={() => setRestoreBackup(null)}
								className='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
								disabled={restoreStatus === 'running'}
							>
								Close
							</button>
							<button
								onClick={handleRestore}
								disabled={
									actionLoading !== null ||
									restoreConfirmText.trim() !==
										(restoreBackup.project_name || restoreBackup.name)
								}
								className='px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2'
							>
								{actionLoading !== null && (
									<Loader2 className='h-4 w-4 animate-spin' />
								)}
								Confirm Restore
							</button>
						</div>
					</div>
				</div>
			)}

			<TaskLogModal
				isOpen={logModal.isOpen}
				onClose={() => setLogModal({ ...logModal, isOpen: false })}
				backupId={logModal.backupId}
				backupName={logModal.backupName}
				isRunning={logModal.isRunning}
			/>
		</div>
	);
};

export default Backups;
