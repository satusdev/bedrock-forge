/**
 * Sync Modal Component
 *
 * Modal for syncing between environments (staging ↔ production).
 * Supports database, uploads, plugins, themes sync with progress tracking.
 */
import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
	ArrowRight,
	ArrowLeft,
	Database,
	Image,
	Package,
	Palette,
	AlertTriangle,
	CheckCircle,
	XCircle,
	RefreshCw,
	Play,
	Archive,
	X,
} from 'lucide-react';
import Button from './ui/Button';
import Badge from './ui/Badge';
import api from '../services/api';
import toast from 'react-hot-toast';

interface Environment {
	id: number;
	environment: 'staging' | 'production' | 'development';
	server_id: number;
	server_name: string;
	wp_url: string;
	wp_path: string;
	is_primary: boolean;
}

interface SyncModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectId: number;
	projectName: string;
	environments: Environment[];
	initialSource?: Environment;
	initialDirection?: 'push' | 'pull';
}

interface SyncOptions {
	sync_database: boolean;
	sync_uploads: boolean;
	sync_plugins: boolean;
	sync_themes: boolean;
	backup_first: boolean;
	dry_run: boolean;
}

interface SyncStatus {
	task_id: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	progress: number;
	message: string;
	result?: any;
}

const SyncModal: React.FC<SyncModalProps> = ({
	isOpen,
	onClose,
	projectId,
	projectName,
	environments,
	initialSource,
	initialDirection = 'push',
}) => {
	// Find staging and production environments
	const stagingEnv = environments.find(e => e.environment === 'staging');
	const productionEnv = environments.find(e => e.environment === 'production');

	// Determine initial source/target based on props
	const getInitialSource = () => {
		if (initialSource) return initialSource;
		return initialDirection === 'push' ? stagingEnv : productionEnv;
	};

	const getInitialTarget = () => {
		if (initialSource) {
			return initialSource.environment === 'staging'
				? productionEnv
				: stagingEnv;
		}
		return initialDirection === 'push' ? productionEnv : stagingEnv;
	};

	const [sourceEnv, setSourceEnv] = useState<Environment | undefined>(
		getInitialSource()
	);
	const [targetEnv, setTargetEnv] = useState<Environment | undefined>(
		getInitialTarget()
	);
	const [syncOptions, setSyncOptions] = useState<SyncOptions>({
		sync_database: true,
		sync_uploads: true,
		sync_plugins: false,
		sync_themes: false,
		backup_first: true,
		dry_run: false,
	});
	const [showConfirm, setShowConfirm] = useState(false);
	const [taskId, setTaskId] = useState<string | null>(null);

	// Reset state when modal opens
	useEffect(() => {
		if (isOpen) {
			setSourceEnv(getInitialSource());
			setTargetEnv(getInitialTarget());
			setTaskId(null);
			setShowConfirm(false);
		}
	}, [isOpen, initialSource, initialDirection]);

	// Sync status polling
	const { data: syncStatus } = useQuery<SyncStatus>({
		queryKey: ['sync-status', taskId],
		queryFn: async () => {
			const response = await api.get(`/sync/status/${taskId}`);
			return response.data;
		},
		enabled: !!taskId,
		refetchInterval: taskId ? 3000 : false, // Poll every 3 seconds while task is active
	});

	// Stop polling when task completes
	useEffect(() => {
		if (syncStatus?.status === 'completed' || syncStatus?.status === 'failed') {
			if (syncStatus.status === 'completed') {
				toast.success('Sync completed successfully!');
			} else {
				toast.error(`Sync failed: ${syncStatus.message}`);
			}
		}
	}, [syncStatus?.status]);

	// Sync mutation
	const syncMutation = useMutation({
		mutationFn: async () => {
			if (!sourceEnv || !targetEnv) throw new Error('Select environments');

			const params = new URLSearchParams({
				source_project_server_id: sourceEnv.id.toString(),
				target_project_server_id: targetEnv.id.toString(),
				sync_database: syncOptions.sync_database.toString(),
				sync_uploads: syncOptions.sync_uploads.toString(),
				sync_plugins: syncOptions.sync_plugins.toString(),
				sync_themes: syncOptions.sync_themes.toString(),
				dry_run: syncOptions.dry_run.toString(),
			});

			const response = await api.post(`/sync/full?${params.toString()}`);
			return response.data;
		},
		onSuccess: data => {
			setTaskId(data.task_id);
			setShowConfirm(false);
			toast.success(
				syncOptions.dry_run ? 'Dry run started...' : 'Sync started...'
			);
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Sync failed to start');
		},
	});

	// Swap source and target
	const swapDirection = () => {
		const temp = sourceEnv;
		setSourceEnv(targetEnv);
		setTargetEnv(temp);
	};

	const handleStartSync = () => {
		if (syncOptions.dry_run) {
			// Dry run doesn't need confirmation
			syncMutation.mutate();
		} else {
			setShowConfirm(true);
		}
	};

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

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'completed':
				return <CheckCircle className='w-5 h-5 text-green-500' />;
			case 'failed':
				return <XCircle className='w-5 h-5 text-red-500' />;
			case 'running':
				return <RefreshCw className='w-5 h-5 text-blue-500 animate-spin' />;
			default:
				return <RefreshCw className='w-5 h-5 text-gray-400' />;
		}
	};

	if (!isOpen) return null;

	// Not enough environments
	if (environments.length < 2) {
		return (
			<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
				<div className='bg-white rounded-lg p-6 max-w-md w-full mx-4'>
					<div className='text-center'>
						<AlertTriangle className='w-12 h-12 mx-auto mb-3 text-yellow-500' />
						<h3 className='text-lg font-medium text-gray-900 mb-2'>
							Multiple Environments Required
						</h3>
						<p className='text-gray-600 mb-4'>
							You need at least two linked environments (e.g., staging and
							production) to sync between them.
						</p>
						<Button variant='secondary' onClick={onClose}>
							Close
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto'>
				{/* Header */}
				<div className='flex items-center justify-between p-4 border-b'>
					<h2 className='text-lg font-semibold text-gray-900'>
						Sync Environments
					</h2>
					<button
						onClick={onClose}
						className='text-gray-400 hover:text-gray-600'
					>
						<X className='w-5 h-5' />
					</button>
				</div>

				<div className='p-4 space-y-6'>
					{/* Active Task Status */}
					{taskId && syncStatus && (
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
									{getStatusIcon(syncStatus.status)}
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

							{syncStatus.status === 'completed' ||
							syncStatus.status === 'failed' ? (
								<Button
									variant='secondary'
									size='sm'
									className='mt-3'
									onClick={() => setTaskId(null)}
								>
									Start New Sync
								</Button>
							) : null}
						</div>
					)}

					{/* Direction Selector */}
					{!taskId && (
						<>
							<div className='flex items-center justify-center space-x-4'>
								{/* Source */}
								<div className='flex-1 text-center'>
									<select
										value={sourceEnv?.id || ''}
										onChange={e => {
											const env = environments.find(
												env => env.id === Number(e.target.value)
											);
											setSourceEnv(env);
											// Auto-set target to other environment
											if (env && targetEnv?.id === env.id) {
												setTargetEnv(environments.find(e => e.id !== env.id));
											}
										}}
										className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500'
									>
										{environments.map(env => (
											<option key={env.id} value={env.id}>
												{env.environment.charAt(0).toUpperCase() +
													env.environment.slice(1)}{' '}
												({env.server_name})
											</option>
										))}
									</select>
									<p className='text-xs text-gray-500 mt-1'>Source</p>
								</div>

								{/* Swap Button */}
								<button
									onClick={swapDirection}
									className='p-2 rounded-full hover:bg-gray-100 transition-colors'
									title='Swap direction'
								>
									<ArrowRight className='w-6 h-6 text-gray-400' />
								</button>

								{/* Target */}
								<div className='flex-1 text-center'>
									<select
										value={targetEnv?.id || ''}
										onChange={e => {
											const env = environments.find(
												env => env.id === Number(e.target.value)
											);
											setTargetEnv(env);
										}}
										className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500'
									>
										{environments
											.filter(env => env.id !== sourceEnv?.id)
											.map(env => (
												<option key={env.id} value={env.id}>
													{env.environment.charAt(0).toUpperCase() +
														env.environment.slice(1)}{' '}
													({env.server_name})
												</option>
											))}
									</select>
									<p className='text-xs text-gray-500 mt-1'>Target</p>
								</div>
							</div>

							{/* Visual Direction Indicator */}
							<div className='flex items-center justify-center py-4 bg-gray-50 rounded-lg'>
								<div className='text-center px-4'>
									<Badge
										variant={
											getEnvironmentColor(sourceEnv?.environment || '') as any
										}
									>
										{sourceEnv?.environment}
									</Badge>
									<p className='text-xs text-gray-500 mt-1 truncate max-w-[120px]'>
										{sourceEnv?.wp_url.replace(/https?:\/\//, '')}
									</p>
								</div>
								<div className='px-4'>
									<ArrowRight className='w-8 h-8 text-gray-400' />
								</div>
								<div className='text-center px-4'>
									<Badge
										variant={
											getEnvironmentColor(targetEnv?.environment || '') as any
										}
									>
										{targetEnv?.environment}
									</Badge>
									<p className='text-xs text-gray-500 mt-1 truncate max-w-[120px]'>
										{targetEnv?.wp_url.replace(/https?:\/\//, '')}
									</p>
								</div>
							</div>

							{/* Sync Options */}
							<div className='space-y-3'>
								<h4 className='font-medium text-gray-900'>What to sync:</h4>
								<div className='grid grid-cols-2 gap-3'>
									<label className='flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer'>
										<input
											type='checkbox'
											checked={syncOptions.sync_database}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													sync_database: e.target.checked,
												}))
											}
											className='rounded border-gray-300 text-primary-600 focus:ring-primary-500'
										/>
										<Database className='w-4 h-4 text-gray-500' />
										<span className='text-sm'>Database</span>
									</label>
									<label className='flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer'>
										<input
											type='checkbox'
											checked={syncOptions.sync_uploads}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													sync_uploads: e.target.checked,
												}))
											}
											className='rounded border-gray-300 text-primary-600 focus:ring-primary-500'
										/>
										<Image className='w-4 h-4 text-gray-500' />
										<span className='text-sm'>Uploads</span>
									</label>
									<label className='flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer'>
										<input
											type='checkbox'
											checked={syncOptions.sync_plugins}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													sync_plugins: e.target.checked,
												}))
											}
											className='rounded border-gray-300 text-primary-600 focus:ring-primary-500'
										/>
										<Package className='w-4 h-4 text-gray-500' />
										<span className='text-sm'>Plugins</span>
									</label>
									<label className='flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer'>
										<input
											type='checkbox'
											checked={syncOptions.sync_themes}
											onChange={e =>
												setSyncOptions(prev => ({
													...prev,
													sync_themes: e.target.checked,
												}))
											}
											className='rounded border-gray-300 text-primary-600 focus:ring-primary-500'
										/>
										<Palette className='w-4 h-4 text-gray-500' />
										<span className='text-sm'>Themes</span>
									</label>
								</div>

								{/* Additional Options */}
								<div className='pt-3 border-t space-y-2'>
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
											className='rounded border-gray-300 text-primary-600 focus:ring-primary-500'
										/>
										<Archive className='w-4 h-4 text-gray-500' />
										<span className='text-sm'>
											Backup target before sync{' '}
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
											className='rounded border-gray-300 text-primary-600 focus:ring-primary-500'
										/>
										<RefreshCw className='w-4 h-4 text-gray-500' />
										<span className='text-sm'>
											Dry run (preview changes only)
										</span>
									</label>
								</div>
							</div>

							{/* Warning for Production */}
							{targetEnv?.environment === 'production' &&
								!syncOptions.dry_run && (
									<div className='flex items-start p-3 bg-yellow-50 border border-yellow-200 rounded-lg'>
										<AlertTriangle className='w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5' />
										<div className='text-sm text-yellow-800'>
											<strong>Warning:</strong> You are about to sync to{' '}
											<strong>production</strong>. This will overwrite live
											data. Make sure you have a backup.
										</div>
									</div>
								)}
						</>
					)}
				</div>

				{/* Footer Actions */}
				{!taskId && (
					<div className='flex items-center justify-end space-x-3 p-4 border-t bg-gray-50'>
						<Button variant='secondary' onClick={onClose}>
							Cancel
						</Button>
						<Button
							variant={
								targetEnv?.environment === 'production' && !syncOptions.dry_run
									? 'danger'
									: 'primary'
							}
							onClick={handleStartSync}
							disabled={
								syncMutation.isPending ||
								!sourceEnv ||
								!targetEnv ||
								(!syncOptions.sync_database &&
									!syncOptions.sync_uploads &&
									!syncOptions.sync_plugins &&
									!syncOptions.sync_themes)
							}
						>
							{syncMutation.isPending ? (
								<>
									<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
									Starting...
								</>
							) : syncOptions.dry_run ? (
								<>
									<Play className='w-4 h-4 mr-2' />
									Preview Sync
								</>
							) : (
								<>
									<Play className='w-4 h-4 mr-2' />
									Start Sync
								</>
							)}
						</Button>
					</div>
				)}

				{/* Confirmation Dialog */}
				{showConfirm && (
					<div className='absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center'>
						<div className='bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl'>
							<div className='flex items-start mb-4'>
								<AlertTriangle className='w-6 h-6 text-yellow-500 mr-3 flex-shrink-0' />
								<div>
									<h3 className='text-lg font-medium text-gray-900'>
										Confirm Sync
									</h3>
									<p className='mt-2 text-sm text-gray-600'>
										This will sync from{' '}
										<Badge
											variant={
												getEnvironmentColor(sourceEnv?.environment || '') as any
											}
										>
											{sourceEnv?.environment}
										</Badge>{' '}
										to{' '}
										<Badge
											variant={
												getEnvironmentColor(targetEnv?.environment || '') as any
											}
										>
											{targetEnv?.environment}
										</Badge>
										.
										{syncOptions.sync_database && (
											<span className='block mt-1'>
												• Database will be overwritten
											</span>
										)}
										{syncOptions.sync_uploads && (
											<span className='block'>• Uploads will be synced</span>
										)}
										{syncOptions.backup_first && (
											<span className='block text-green-600'>
												• A backup will be created first
											</span>
										)}
									</p>
								</div>
							</div>
							<div className='flex justify-end space-x-3'>
								<Button
									variant='secondary'
									onClick={() => setShowConfirm(false)}
								>
									Cancel
								</Button>
								<Button
									variant={
										targetEnv?.environment === 'production'
											? 'danger'
											: 'primary'
									}
									onClick={() => syncMutation.mutate()}
								>
									Confirm Sync
								</Button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default SyncModal;
