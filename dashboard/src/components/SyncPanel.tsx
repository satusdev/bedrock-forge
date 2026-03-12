/**
 * Sync Panel Component
 *
 * Provides sync controls for pulling/pushing database and files
 * between local development and remote servers (staging/production).
 */
import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
	ArrowDown,
	ArrowUp,
	Database,
	FolderSync,
	RefreshCw,
	AlertTriangle,
	CheckCircle,
	XCircle,
	Server,
	Cloud,
	Play,
	Settings,
} from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import SyncTaskLogsModal from './SyncTaskLogsModal';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
	readSyncTaskHistory,
	upsertSyncTaskHistory,
	type SyncTaskSnapshot,
} from '../utils/syncLogStorage';

interface SyncStatus {
	task_id: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	progress: number;
	message: string;
	logs?: string;
	result?: any;
}

interface ProjectServer {
	id: number;
	server_id: number;
	server_name: string;
	environment: 'staging' | 'production' | 'development';
	wp_path: string;
	wp_url: string;
	is_primary: boolean;
}

interface SyncPanelProps {
	projectId: number;
	projectName: string;
	projectServers: ProjectServer[];
	onServerLink?: () => void;
}

interface SyncOptions {
	sync_database: boolean;
	sync_uploads: boolean;
	sync_plugins: boolean;
	sync_themes: boolean;
	backup_first: boolean;
	dry_run: boolean;
}

const SyncPanel: React.FC<SyncPanelProps> = ({
	projectId,
	projectName,
	projectServers,
	onServerLink,
}) => {
	const [selectedServer, setSelectedServer] = useState<ProjectServer | null>(
		projectServers.find(s => s.is_primary) || projectServers[0] || null,
	);
	const [syncDirection, setSyncDirection] = useState<'pull' | 'push'>('pull');
	const [showOptions, setShowOptions] = useState(false);
	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const [pendingAction, setPendingAction] = useState<string | null>(null);
	const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
	const [isTaskTerminal, setIsTaskTerminal] = useState(false);
	const [showLogsModal, setShowLogsModal] = useState(false);
	const [taskHistory, setTaskHistory] = useState<SyncTaskSnapshot[]>([]);
	const storageKey = `sync-active-task:${projectId}`;

	const [syncOptions, setSyncOptions] = useState<SyncOptions>({
		sync_database: true,
		sync_uploads: true,
		sync_plugins: false,
		sync_themes: false,
		backup_first: true,
		dry_run: false,
	});

	const queryClient = useQueryClient();

	const { data: persistedHistory } = useQuery<SyncTaskSnapshot[]>({
		queryKey: ['sync-history', projectId],
		queryFn: async () => {
			const response = await api.get(`/sync/history/${projectId}`, {
				params: { limit: 50 },
			});
			const tasks = Array.isArray(response.data?.tasks)
				? response.data.tasks
				: [];
			return tasks.map((task: any) => ({
				task_id: task.task_id,
				status: task.status,
				message: task.message,
				progress: typeof task.progress === 'number' ? task.progress : 0,
				logs: typeof task.logs === 'string' ? task.logs : '',
				updated_at:
					typeof task.updated_at === 'string'
						? task.updated_at
						: new Date().toISOString(),
			}));
		},
		enabled: projectId > 0,
	});

	// Sync status polling
	const { data: syncStatus } = useQuery<SyncStatus>({
		queryKey: ['sync-status', activeTaskId],
		queryFn: async () => {
			const response = await api.get(`/sync/status/${activeTaskId}`);
			return response.data;
		},
		enabled: !!activeTaskId && !isTaskTerminal,
		refetchInterval: 3000,
	});

	useEffect(() => {
		const existingTaskId = window.localStorage.getItem(storageKey);
		if (existingTaskId) {
			setActiveTaskId(existingTaskId);
			setIsTaskTerminal(false);
		}
	}, [projectId, storageKey]);

	useEffect(() => {
		if (persistedHistory && persistedHistory.length > 0) {
			setTaskHistory(persistedHistory);
			return;
		}
		setTaskHistory(readSyncTaskHistory(projectId));
	}, [persistedHistory, projectId]);

	useEffect(() => {
		if (!activeTaskId) {
			window.localStorage.removeItem(storageKey);
			setIsTaskTerminal(false);
			return;
		}
		window.localStorage.setItem(storageKey, activeTaskId);
	}, [activeTaskId, storageKey]);

	useEffect(() => {
		if (!activeTaskId || !syncStatus) {
			return;
		}

		const nextHistory = upsertSyncTaskHistory(projectId, {
			task_id: activeTaskId,
			status: syncStatus.status,
			message: syncStatus.message,
			progress: syncStatus.progress,
			logs: syncStatus.logs || '',
			updated_at: new Date().toISOString(),
		});
		setTaskHistory(nextHistory);
	}, [activeTaskId, projectId, syncStatus]);

	// Handle task completion
	useEffect(() => {
		if (syncStatus?.status === 'completed' || syncStatus?.status === 'failed') {
			setIsTaskTerminal(true);
			if (syncStatus.status === 'completed') {
				toast.success('Sync completed successfully!');
			} else {
				toast.error(`Sync failed: ${syncStatus.message}`);
			}
		}
	}, [syncStatus?.status]);

	// Database pull mutation
	const dbPullMutation = useMutation({
		mutationFn: async () => {
			if (!selectedServer) throw new Error('No server selected');
			return api.post('/sync/database/pull', {
				source_project_server_id: selectedServer.id,
				target: 'local',
				search_replace: true,
			});
		},
		onSuccess: data => {
			const nextTaskId = data.data?.task_id || null;
			setActiveTaskId(nextTaskId);
			setIsTaskTerminal(false);
			if (nextTaskId) {
				setTaskHistory(
					upsertSyncTaskHistory(projectId, {
						task_id: nextTaskId,
						status: 'pending',
						message: 'sync.pull_database task queued',
						progress: 0,
						logs: '',
						updated_at: new Date().toISOString(),
					}),
				);
			}
			toast.success('Database pull started');
			queryClient.invalidateQueries({ queryKey: ['project', projectName] });
		},
		onError: (error: any) => {
			toast.error(`Database pull failed: ${error.message}`);
		},
	});

	// Database push mutation
	const dbPushMutation = useMutation({
		mutationFn: async () => {
			if (!selectedServer) throw new Error('No server selected');
			return api.post('/sync/database/push', {
				source: 'local',
				target_project_server_id: selectedServer.id,
				search_replace: true,
				backup_first: syncOptions.backup_first,
			});
		},
		onSuccess: () => {
			setActiveTaskId(null); // Push doesn't return task_id in current API
			toast.success('Database push started');
			queryClient.invalidateQueries({ queryKey: ['project', projectName] });
		},
		onError: (error: any) => {
			toast.error(`Database push failed: ${error.message}`);
		},
	});

	// Files pull mutation
	const filesPullMutation = useMutation({
		mutationFn: async (paths: string[]) => {
			if (!selectedServer) throw new Error('No server selected');
			return api.post('/sync/files/pull', {
				source_project_server_id: selectedServer.id,
				paths,
				target: 'local',
				dry_run: syncOptions.dry_run,
			});
		},
		onSuccess: () => {
			toast.success('Files sync started');
		},
		onError: (error: any) => {
			toast.error(`Files sync failed: ${error.message}`);
		},
	});

	// Files push mutation
	const filesPushMutation = useMutation({
		mutationFn: async (paths: string[]) => {
			if (!selectedServer) throw new Error('No server selected');
			return api.post('/sync/files/push', {
				source: 'local',
				target_project_server_id: selectedServer.id,
				paths,
				dry_run: syncOptions.dry_run,
				delete_extra: false,
			});
		},
		onSuccess: () => {
			toast.success('Files push started');
		},
		onError: (error: any) => {
			toast.error(`Files push failed: ${error.message}`);
		},
	});

	// Full sync mutation
	const fullSyncMutation = useMutation({
		mutationFn: async () => {
			if (!selectedServer) throw new Error('No server selected');
			return api.post(
				`/projects/${projectId}/servers/${selectedServer.id}/sync`,
				syncOptions,
			);
		},
		onSuccess: () => {
			toast.success('Full sync started');
			setShowConfirmModal(false);
		},
		onError: (error: any) => {
			toast.error(`Sync failed: ${error.message}`);
		},
	});

	const handleDatabaseSync = () => {
		if (syncDirection === 'pull') {
			dbPullMutation.mutate();
		} else {
			// Push requires confirmation
			setPendingAction('db_push');
			setShowConfirmModal(true);
		}
	};

	const handleFilesSync = () => {
		const paths: string[] = [];
		if (syncOptions.sync_uploads) paths.push('uploads');
		if (syncOptions.sync_plugins) paths.push('plugins');
		if (syncOptions.sync_themes) paths.push('themes');

		if (paths.length === 0) {
			toast.error('Select at least one file type to sync');
			return;
		}

		if (syncDirection === 'pull') {
			filesPullMutation.mutate(paths);
		} else {
			setPendingAction('files_push');
			setShowConfirmModal(true);
		}
	};

	const handleFullSync = () => {
		setPendingAction('full_sync');
		setShowConfirmModal(true);
	};

	const confirmAction = () => {
		if (pendingAction === 'db_push') {
			dbPushMutation.mutate();
		} else if (pendingAction === 'files_push') {
			const paths: string[] = [];
			if (syncOptions.sync_uploads) paths.push('uploads');
			if (syncOptions.sync_plugins) paths.push('plugins');
			if (syncOptions.sync_themes) paths.push('themes');
			filesPushMutation.mutate(paths);
		} else if (pendingAction === 'full_sync') {
			fullSyncMutation.mutate();
		}
		setShowConfirmModal(false);
		setPendingAction(null);
	};

	const isLoading =
		dbPullMutation.isPending ||
		dbPushMutation.isPending ||
		filesPullMutation.isPending ||
		filesPushMutation.isPending ||
		fullSyncMutation.isPending;

	const getEnvironmentColor = (env: string) => {
		switch (env) {
			case 'production':
				return 'danger';
			case 'staging':
				return 'warning';
			case 'development':
				return 'info';
			default:
				return 'default';
		}
	};

	if (projectServers.length === 0) {
		return (
			<Card title='Environment Sync'>
				<div className='text-center py-8'>
					<Server className='w-12 h-12 mx-auto mb-3 text-gray-300' />
					<h3 className='text-lg font-medium text-gray-900 mb-2'>
						No Servers Linked
					</h3>
					<p className='text-gray-500 mb-4'>
						Link a server to this project to enable environment sync.
					</p>
					{onServerLink && (
						<Button onClick={onServerLink}>
							<Server className='w-4 h-4 mr-2' />
							Link Server
						</Button>
					)}
				</div>
			</Card>
		);
	}

	return (
		<>
			<Card title='Environment Sync'>
				<div className='space-y-6'>
					{/* Active Task Status */}
					{activeTaskId && syncStatus && (
						<div
							className={`p-4 rounded-lg ${
								syncStatus.status === 'completed'
									? 'bg-green-50 border border-green-200'
									: syncStatus.status === 'failed'
										? 'bg-red-50 border border-red-200'
										: 'bg-blue-50 border border-blue-200'
							}`}
						>
							<div className='flex items-center justify-between mb-2'>
								<div className='flex items-center space-x-2'>
									{syncStatus.status === 'completed' ? (
										<CheckCircle className='w-5 h-5 text-green-500' />
									) : syncStatus.status === 'failed' ? (
										<XCircle className='w-5 h-5 text-red-500' />
									) : (
										<RefreshCw className='w-5 h-5 text-blue-500 animate-spin' />
									)}
									<span className='font-medium capitalize'>
										{syncStatus.status}
									</span>
								</div>
								<span className='text-sm text-gray-600'>
									{syncStatus.progress}%
								</span>
							</div>
							{/* Progress Bar */}
							<div className='w-full bg-gray-200 rounded-full h-2 mb-2'>
								<div
									className={`h-2 rounded-full transition-all duration-300 ${
										syncStatus.status === 'completed'
											? 'bg-green-500'
											: syncStatus.status === 'failed'
												? 'bg-red-500'
												: 'bg-blue-500'
									}`}
									style={{ width: `${syncStatus.progress}%` }}
								/>
							</div>
							<p className='text-sm text-gray-600'>{syncStatus.message}</p>
							{(syncStatus.status === 'completed' ||
								syncStatus.status === 'failed') && (
								<Button
									variant='secondary'
									size='sm'
									className='mt-3'
									onClick={() => {
										setActiveTaskId(null);
										setIsTaskTerminal(false);
										window.localStorage.removeItem(storageKey);
									}}
								>
									Dismiss
								</Button>
							)}
							{syncStatus.logs && (
								<pre className='mt-3 max-h-56 overflow-auto rounded-md bg-gray-900 text-gray-200 p-3 text-xs whitespace-pre-wrap break-all'>
									{syncStatus.logs}
								</pre>
							)}
							<Button
								variant='secondary'
								size='sm'
								className='mt-3'
								onClick={() => setShowLogsModal(true)}
							>
								View Full Logs
							</Button>
						</div>
					)}

					{/* Server Selection */}
					<div>
						<label className='block text-sm font-medium text-gray-700 mb-2'>
							Remote Environment
						</label>
						<div className='flex flex-wrap gap-2'>
							{projectServers.map(server => (
								<button
									key={server.id}
									onClick={() => setSelectedServer(server)}
									className={`flex items-center px-3 py-2 rounded-lg border transition-colors ${
										selectedServer?.id === server.id
											? 'border-primary-500 bg-primary-50 text-primary-700'
											: 'border-gray-200 hover:border-gray-300'
									}`}
								>
									<Cloud className='w-4 h-4 mr-2' />
									<span className='font-medium'>{server.server_name}</span>
									<Badge
										variant={getEnvironmentColor(server.environment) as any}
										className='ml-2'
									>
										{server.environment}
									</Badge>
									{server.is_primary && (
										<CheckCircle className='w-4 h-4 ml-2 text-green-500' />
									)}
								</button>
							))}
						</div>
					</div>

					{/* Sync Direction */}
					{selectedServer && (
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-2'>
								Sync Direction
							</label>
							<div className='flex items-center space-x-4'>
								<button
									onClick={() => setSyncDirection('pull')}
									className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg border transition-colors ${
										syncDirection === 'pull'
											? 'border-blue-500 bg-blue-50 text-blue-700'
											: 'border-gray-200 hover:border-gray-300'
									}`}
								>
									<ArrowDown className='w-5 h-5 mr-2' />
									<div className='text-left'>
										<div className='font-medium'>Pull</div>
										<div className='text-xs opacity-75'>
											{selectedServer.environment} → Local
										</div>
									</div>
								</button>
								<button
									onClick={() => setSyncDirection('push')}
									className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg border transition-colors ${
										syncDirection === 'push'
											? 'border-orange-500 bg-orange-50 text-orange-700'
											: 'border-gray-200 hover:border-gray-300'
									}`}
								>
									<ArrowUp className='w-5 h-5 mr-2' />
									<div className='text-left'>
										<div className='font-medium'>Push</div>
										<div className='text-xs opacity-75'>
											Local → {selectedServer.environment}
										</div>
									</div>
								</button>
							</div>
						</div>
					)}

					{/* Sync Options */}
					{selectedServer && (
						<div>
							<button
								onClick={() => setShowOptions(!showOptions)}
								className='flex items-center text-sm text-gray-600 hover:text-gray-900'
							>
								<Settings className='w-4 h-4 mr-1' />
								{showOptions ? 'Hide' : 'Show'} Options
							</button>

							{showOptions && (
								<div className='mt-3 space-y-2 p-3 bg-gray-50 rounded-lg'>
									<label className='flex items-center space-x-3'>
										<input
											type='checkbox'
											checked={syncOptions.sync_database}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													sync_database: e.target.checked,
												}))
											}
											className='rounded border-gray-300'
										/>
										<span className='text-sm'>Sync Database</span>
									</label>
									<label className='flex items-center space-x-3'>
										<input
											type='checkbox'
											checked={syncOptions.sync_uploads}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													sync_uploads: e.target.checked,
												}))
											}
											className='rounded border-gray-300'
										/>
										<span className='text-sm'>Sync Uploads</span>
									</label>
									<label className='flex items-center space-x-3'>
										<input
											type='checkbox'
											checked={syncOptions.sync_plugins}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													sync_plugins: e.target.checked,
												}))
											}
											className='rounded border-gray-300'
										/>
										<span className='text-sm'>Sync Plugins</span>
									</label>
									<label className='flex items-center space-x-3'>
										<input
											type='checkbox'
											checked={syncOptions.sync_themes}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													sync_themes: e.target.checked,
												}))
											}
											className='rounded border-gray-300'
										/>
										<span className='text-sm'>Sync Themes</span>
									</label>
									<hr className='my-2' />
									<label className='flex items-center space-x-3'>
										<input
											type='checkbox'
											checked={syncOptions.backup_first}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													backup_first: e.target.checked,
												}))
											}
											className='rounded border-gray-300'
										/>
										<span className='text-sm'>
											Backup before push{' '}
											<span className='text-green-600'>(recommended)</span>
										</span>
									</label>
									<label className='flex items-center space-x-3'>
										<input
											type='checkbox'
											checked={syncOptions.dry_run}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													dry_run: e.target.checked,
												}))
											}
											className='rounded border-gray-300'
										/>
										<span className='text-sm'>Dry Run (preview changes)</span>
									</label>
								</div>
							)}
						</div>
					)}

					{/* Action Buttons */}
					{selectedServer && (
						<div className='flex flex-wrap gap-3'>
							<Button
								variant='secondary'
								onClick={handleDatabaseSync}
								disabled={isLoading}
							>
								<Database className='w-4 h-4 mr-2' />
								{syncDirection === 'pull' ? 'Pull' : 'Push'} Database
							</Button>
							<Button
								variant='secondary'
								onClick={handleFilesSync}
								disabled={isLoading}
							>
								<FolderSync className='w-4 h-4 mr-2' />
								{syncDirection === 'pull' ? 'Pull' : 'Push'} Files
							</Button>
							<Button
								variant='primary'
								onClick={handleFullSync}
								disabled={isLoading}
							>
								{isLoading ? (
									<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
								) : (
									<Play className='w-4 h-4 mr-2' />
								)}
								Full Sync
							</Button>
						</div>
					)}

					{/* Server Info */}
					{selectedServer && (
						<div className='text-xs text-gray-500 border-t pt-4'>
							<p>
								<strong>Path:</strong> {selectedServer.wp_path}
							</p>
							<p>
								<strong>URL:</strong> {selectedServer.wp_url}
							</p>
						</div>
					)}
				</div>
			</Card>

			{/* Confirmation Modal */}
			{showConfirmModal && (
				<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-lg p-6 max-w-md w-full mx-4'>
						<div className='flex items-start mb-4'>
							<AlertTriangle className='w-6 h-6 text-yellow-500 mr-3 flex-shrink-0' />
							<div>
								<h3 className='text-lg font-medium text-gray-900'>
									Confirm {syncDirection === 'push' ? 'Push' : 'Sync'}
								</h3>
								<p className='mt-2 text-sm text-gray-600'>
									{pendingAction === 'db_push' && (
										<>
											This will <strong>overwrite the database</strong> on{' '}
											<Badge
												variant={
													getEnvironmentColor(
														selectedServer?.environment || '',
													) as any
												}
											>
												{selectedServer?.environment}
											</Badge>
											. A backup will be created first.
										</>
									)}
									{pendingAction === 'files_push' && (
										<>
											This will push local files to{' '}
											<Badge
												variant={
													getEnvironmentColor(
														selectedServer?.environment || '',
													) as any
												}
											>
												{selectedServer?.environment}
											</Badge>
											.
										</>
									)}
									{pendingAction === 'full_sync' && (
										<>
											This will perform a full sync with{' '}
											<Badge
												variant={
													getEnvironmentColor(
														selectedServer?.environment || '',
													) as any
												}
											>
												{selectedServer?.environment}
											</Badge>
											.
											{syncDirection === 'push' &&
												' Remote data will be overwritten.'}
										</>
									)}
								</p>
							</div>
						</div>
						<div className='flex justify-end space-x-3'>
							<Button
								variant='secondary'
								onClick={() => {
									setShowConfirmModal(false);
									setPendingAction(null);
								}}
							>
								Cancel
							</Button>
							<Button
								variant={syncDirection === 'push' ? 'danger' : 'primary'}
								onClick={confirmAction}
							>
								{syncDirection === 'push' ? 'Push' : 'Sync'}
							</Button>
						</div>
					</div>
				</div>
			)}

			<SyncTaskLogsModal
				isOpen={showLogsModal}
				onClose={() => setShowLogsModal(false)}
				title='Sync Task Logs'
				activeTaskId={activeTaskId}
				activeStatus={syncStatus?.status}
				activeLogs={syncStatus?.logs}
				history={taskHistory}
			/>
		</>
	);
};

export default SyncPanel;
