import React, { useState, useEffect } from 'react';
import {
	Calendar,
	Clock,
	Play,
	Power,
	Trash2,
	Edit,
	Plus,
	RefreshCw,
	AlertCircle,
	CheckCircle,
	XCircle,
	Loader2,
} from 'lucide-react';
import { dashboardApi, settingsApi } from '../services/api';
import {
	BackupSchedule,
	ScheduleCreateInput,
	ScheduleFrequency,
	BackupType,
	BackupStorageType,
	ProjectServerSummary,
} from '../types';
import toast from 'react-hot-toast';
import Button from './ui/Button';
import Card from './ui/Card';
import Badge from './ui/Badge';

interface BackupSchedulePanelProps {
	projectId: number;
	projectName: string;
}

const BackupSchedulePanel: React.FC<BackupSchedulePanelProps> = ({
	projectId,
	projectName,
}) => {
	const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
	const [loading, setLoading] = useState(true);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<BackupSchedule | null>(
		null
	);
	const [actionLoading, setActionLoading] = useState<number | null>(null);

	// Form state
	const [environments, setEnvironments] = useState<ProjectServerSummary[]>([]);
	const [formData, setFormData] = useState<ScheduleCreateInput>({
		name: '',
		project_id: projectId,
		frequency: 'daily',
		hour: 2,
		minute: 0,
		backup_type: 'full',
		storage_type: 'google_drive',
		retention_count: 7,
		description: '',
		config: {},
	});
	const [s3Config, setS3Config] = useState({ bucket: '', remote: 's3' });

	useEffect(() => {
		if (projectId) {
			fetchSchedules();
			fetchEnvironments();
		}
	}, [projectId]);

	const fetchEnvironments = async () => {
		try {
			// Need to import ProjectServerSummary
			const response = await dashboardApi.getProjectServers(projectId);
			setEnvironments(response.data || []);
		} catch (e) {
			console.error('Failed to fetch environments', e);
		}
	};

	// Path Preview Calculation
	const getPathPreview = () => {
		const timestamp = new Date()
			.toISOString()
			.slice(0, 16)
			.replace('T', '_')
			.replace(':', '-');
		const projName = projectName || 'project';
		const selectedEnv = environments.find(
			e => e.id === formData.environment_id
		);
		const envName = selectedEnv ? selectedEnv.environment : '{environment}';

		if (formData.storage_type === 's3') {
			const bucket = s3Config.bucket || 'bucket';
			return `s3://${bucket}/forge-backups/${projName}/${envName}/${timestamp}`;
		} else if (formData.storage_type === 'google_drive') {
			if (selectedEnv && selectedEnv.gdrive_backups_folder_id) {
				return `gdrive:folder-${selectedEnv.gdrive_backups_folder_id.substring(
					0,
					8
				)}.../${timestamp}`;
			}
			return `gdrive:forge-backups/${projName}/${envName}/${timestamp}`;
		}
		return `local:~/.forge/backups`;
	};

	const fetchDefaults = async () => {
		try {
			// Check for S3 remotes
			const s3Response = await settingsApi.getRcloneRemotes();
			const s3Remotes =
				s3Response.data?.remotes?.filter((r: any) => r.type === 's3') || [];

			if (s3Remotes.length > 0) {
				// Pre-fill S3 if available and not yet set
				const defaultRemote = s3Remotes[0];
				setS3Config(prev => ({
					...prev,
					remote: defaultRemote.name,
					// Try to guess bucket if stored in config/metadata?
					// Or just leave empty. We don't store bucket in remote config usually unless aliased.
				}));

				// If no schedules exist, maybe default to S3?
				// Let's keep Google Drive as default for now unless user changes it,
				// or check if Drive is actually configured.
			}
		} catch (e) {
			console.error('Failed to fetch defaults', e);
		}
	};

	const fetchSchedules = async () => {
		try {
			setLoading(true);
			const response = await dashboardApi.getSchedules({
				project_id: projectId,
			});
			setSchedules(response.data.items || []);
		} catch (error) {
			console.error('Failed to fetch schedules:', error);
			// toast.error('Failed to load schedules'); // Suppress error on init if empty
		} finally {
			setLoading(false);
		}
	};

	const handleCreateSchedule = async () => {
		if (!formData.name) {
			toast.error('Please enter a schedule name');
			return;
		}

		try {
			setActionLoading(-1);
			const payload = { ...formData };
			if (formData.storage_type === 's3') {
				payload.config = {
					...(payload.config || {}),
					s3_bucket: s3Config.bucket,
					s3_remote: s3Config.remote,
				};
			}
			await dashboardApi.createSchedule({ ...payload, project_id: projectId });
			toast.success('Schedule created successfully');
			setShowCreateModal(false);
			resetForm();
			fetchSchedules();
		} catch (error) {
			console.error('Failed to create schedule:', error);
			toast.error('Failed to create schedule');
		} finally {
			setActionLoading(null);
		}
	};

	const handleUpdateSchedule = async () => {
		if (!editingSchedule) return;

		try {
			setActionLoading(editingSchedule.id);
			const payload = { ...formData };
			if (formData.storage_type === 's3') {
				payload.config = {
					...(payload.config || {}),
					s3_bucket: s3Config.bucket,
					s3_remote: s3Config.remote,
				};
			}
			await dashboardApi.updateSchedule(editingSchedule.id, payload);
			toast.success('Schedule updated successfully');
			setEditingSchedule(null);
			resetForm();
			fetchSchedules();
		} catch (error) {
			console.error('Failed to update schedule:', error);
			toast.error('Failed to update schedule');
		} finally {
			setActionLoading(null);
		}
	};

	const handleDeleteSchedule = async (scheduleId: number) => {
		if (!confirm('Are you sure you want to delete this schedule?')) return;

		try {
			setActionLoading(scheduleId);
			await dashboardApi.deleteSchedule(scheduleId);
			toast.success('Schedule deleted');
			fetchSchedules();
		} catch (error) {
			console.error('Failed to delete schedule:', error);
			toast.error('Failed to delete schedule');
		} finally {
			setActionLoading(null);
		}
	};

	const handleToggleStatus = async (schedule: BackupSchedule) => {
		try {
			setActionLoading(schedule.id);
			if (schedule.status === 'active') {
				await dashboardApi.pauseSchedule(schedule.id);
				toast.success('Schedule paused');
			} else {
				await dashboardApi.resumeSchedule(schedule.id);
				toast.success('Schedule resumed');
			}
			fetchSchedules();
		} catch (error) {
			console.error('Failed to toggle schedule:', error);
			toast.error('Failed to toggle schedule');
		} finally {
			setActionLoading(null);
		}
	};

	const handleRunNow = async (scheduleId: number) => {
		try {
			setActionLoading(scheduleId);
			const response = await dashboardApi.runScheduleNow(scheduleId);
			if (response.data.success) {
				toast.success('Backup started successfully');
			} else {
				toast.error(response.data.message || 'Backup failed');
			}
			fetchSchedules();
		} catch (error) {
			console.error('Failed to run schedule:', error);
			toast.error('Failed to run backup');
		} finally {
			setActionLoading(null);
		}
	};

	const resetForm = () => {
		setFormData({
			name: '',
			project_id: projectId,
			frequency: 'daily',
			hour: 2,
			minute: 0,
			backup_type: 'full',
			storage_type: 'google_drive',
			retention_count: 7,
			description: '',
			config: {},
			environment_id: undefined,
		});
		setS3Config({ bucket: '', remote: 's3' });
	};

	const openEditModal = (schedule: BackupSchedule) => {
		setEditingSchedule(schedule);
		setFormData({
			name: schedule.name,
			project_id: schedule.project_id,
			frequency: schedule.frequency,
			hour: schedule.hour,
			minute: schedule.minute,
			day_of_week: schedule.day_of_week,
			day_of_month: schedule.day_of_month,
			timezone: schedule.timezone,
			backup_type: schedule.backup_type,
			storage_type: schedule.storage_type,
			retention_count: schedule.retention_count,
			retention_days: schedule.retention_days,
			description: schedule.description,
			environment_id: schedule.environment_id,
		});
		// Extract S3 config
		if (schedule.config) {
			setS3Config({
				bucket: schedule.config.s3_bucket || '',
				remote: schedule.config.s3_remote || 's3',
			});
		}
	};

	const formatNextRun = (nextRun?: string) => {
		if (!nextRun) return 'Not scheduled';
		const date = new Date(nextRun);
		const now = new Date();
		const diff = date.getTime() - now.getTime();

		if (diff < 0) return 'Overdue';
		if (diff < 3600000) return `In ${Math.round(diff / 60000)} min`;
		if (diff < 86400000) return `In ${Math.round(diff / 3600000)} hours`;
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
	};

	const getStatusIcon = (schedule: BackupSchedule) => {
		if (schedule.status === 'paused') {
			return <AlertCircle className='h-4 w-4 text-yellow-500' />;
		}
		if (schedule.last_run_success === false) {
			return <XCircle className='h-4 w-4 text-red-500' />;
		}
		if (schedule.last_run_success === true) {
			return <CheckCircle className='h-4 w-4 text-green-500' />;
		}
		return <Clock className='h-4 w-4 text-gray-400' />;
	};

	const getBackupTypeLabel = (type: BackupType) => {
		const labels: Record<BackupType, string> = {
			full: 'Full Backup',
			database: 'Database Only',
			files: 'Files Only',
		};
		return labels[type] || type;
	};

	const getStorageTypeLabel = (type: BackupStorageType) => {
		const labels: Record<BackupStorageType, string> = {
			local: 'Local Storage',
			google_drive: 'Google Drive',
			s3: 'AWS S3',
		};
		return labels[type] || type;
	};

	return (
		<div className='space-y-6'>
			<Card>
				<div className='flex justify-between items-center mb-4'>
					<h3 className='text-lg font-medium text-gray-900'>
						Backup Schedules
					</h3>
					<Button
						onClick={() => {
							resetForm();
							setShowCreateModal(true);
						}}
						variant='primary'
						size='sm'
					>
						<Plus className='h-4 w-4 mr-2' />
						New Schedule
					</Button>
				</div>

				{loading ? (
					<div className='flex items-center justify-center py-8'>
						<Loader2 className='h-6 w-6 animate-spin text-indigo-600' />
					</div>
				) : schedules.length > 0 ? (
					<div className='space-y-3'>
						{schedules.map(schedule => (
							<div
								key={schedule.id}
								className='bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700'
							>
								<div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
									<div className='flex items-start gap-3 flex-1'>
										<div
											className={`p-2 rounded-lg mt-1 ${
												schedule.status === 'active'
													? 'bg-green-100 text-green-600'
													: 'bg-gray-200 text-gray-500'
											}`}
										>
											<Clock className='h-5 w-5' />
										</div>
										<div className='flex-1 min-w-0'>
											<div className='flex items-center gap-2 flex-wrap'>
												<h4 className='text-sm font-semibold text-gray-900 dark:text-white'>
													{schedule.name}
												</h4>
												{getStatusIcon(schedule)}
												{schedule.status === 'paused' && (
													<Badge variant='warning'>Paused</Badge>
												)}
											</div>
											<p className='text-xs text-gray-500 mt-1'>
												<span className='font-medium'>
													{schedule.cron_display || schedule.frequency}
												</span>
												<span className='mx-2'>•</span>
												<span>{getBackupTypeLabel(schedule.backup_type)}</span>
												<span className='mx-2'>•</span>
												<span>
													{getStorageTypeLabel(schedule.storage_type)}
												</span>
											</p>
											<div className='text-xs text-indigo-600 mt-1 flex items-center'>
												<Calendar className='h-3 w-3 mr-1' />
												Next: {formatNextRun(schedule.next_run_at)}
											</div>
											{schedule.last_run_error && (
												<p className='text-xs text-red-500 mt-1 truncate max-w-md'>
													Error: {schedule.last_run_error}
												</p>
											)}
										</div>
									</div>

									<div className='flex items-center gap-1 shrink-0'>
										<button
											onClick={() => handleRunNow(schedule.id)}
											disabled={actionLoading === schedule.id}
											className='p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-white transition-all disabled:opacity-50'
											title='Run Now'
										>
											{actionLoading === schedule.id ? (
												<Loader2 className='h-4 w-4 animate-spin' />
											) : (
												<Play className='h-4 w-4' />
											)}
										</button>
										<button
											onClick={() => openEditModal(schedule)}
											className='p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-white transition-all'
											title='Edit'
										>
											<Edit className='h-4 w-4' />
										</button>
										<button
											onClick={() => handleToggleStatus(schedule)}
											disabled={actionLoading === schedule.id}
											className={`p-1.5 rounded-md hover:bg-white transition-all disabled:opacity-50 ${
												schedule.status === 'active'
													? 'text-green-500 hover:text-yellow-500'
													: 'text-gray-400 hover:text-green-500'
											}`}
											title={schedule.status === 'active' ? 'Pause' : 'Resume'}
										>
											<Power className='h-4 w-4' />
										</button>
										<button
											onClick={() => handleDeleteSchedule(schedule.id)}
											disabled={actionLoading === schedule.id}
											className='p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-white transition-all disabled:opacity-50'
											title='Delete'
										>
											<Trash2 className='h-4 w-4' />
										</button>
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className='text-center py-8 text-gray-500'>
						<Calendar className='w-8 h-8 mx-auto mb-2 text-gray-300' />
						<p className='text-sm'>No automation scheduled.</p>
					</div>
				)}
			</Card>

			{/* Create/Edit Modal */}
			{(showCreateModal || editingSchedule) && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
					<div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto'>
						<div className='p-5 border-b border-gray-100 dark:border-gray-700'>
							<h2 className='text-lg font-bold text-gray-900 dark:text-white'>
								{editingSchedule ? 'Edit Schedule' : 'Create New Schedule'}
							</h2>
						</div>

						<div className='p-6 space-y-4'>
							{/* Name */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Name
								</label>
								<input
									type='text'
									value={formData.name}
									onChange={e =>
										setFormData({ ...formData, name: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
									placeholder='e.g., Daily DB Backup'
								/>
							</div>

							{/* Environment */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Environment
								</label>
								<select
									value={formData.environment_id || ''}
									onChange={e =>
										setFormData({
											...formData,
											environment_id: e.target.value
												? parseInt(e.target.value)
												: undefined,
										})
									}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
								>
									<option value=''>All Environments (Project-wide)</option>
									{environments.map(env => (
										<option key={env.id} value={env.id}>
											{env.environment} (
											{env.server_name || 'Server ' + env.server_id})
										</option>
									))}
								</select>
							</div>

							{/* Frequency */}
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
										Frequency
									</label>
									<select
										value={formData.frequency}
										onChange={e =>
											setFormData({
												...formData,
												frequency: e.target.value as ScheduleFrequency,
											})
										}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
									>
										<option value='hourly'>Hourly</option>
										<option value='daily'>Daily</option>
										<option value='weekly'>Weekly</option>
										<option value='monthly'>Monthly</option>
									</select>
								</div>
								{/* Time */}
								<div className='flex gap-2'>
									<div className='flex-1'>
										<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
											Hour
										</label>
										<input
											type='number'
											min={0}
											max={23}
											value={formData.hour}
											onChange={e =>
												setFormData({
													...formData,
													hour: parseInt(e.target.value),
												})
											}
											className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
										/>
									</div>
									<div className='flex-1'>
										<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
											Min
										</label>
										<input
											type='number'
											min={0}
											max={59}
											value={formData.minute}
											onChange={e =>
												setFormData({
													...formData,
													minute: parseInt(e.target.value),
												})
											}
											className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
										/>
									</div>
								</div>
							</div>

							{/* Weekly: Day of Week */}
							{formData.frequency === 'weekly' && (
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
										Day of Week
									</label>
									<select
										value={formData.day_of_week ?? 0}
										onChange={e =>
											setFormData({
												...formData,
												day_of_week: parseInt(e.target.value),
											})
										}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
									>
										<option value={0}>Monday</option>
										<option value={1}>Tuesday</option>
										<option value={2}>Wednesday</option>
										<option value={3}>Thursday</option>
										<option value={4}>Friday</option>
										<option value={5}>Saturday</option>
										<option value={6}>Sunday</option>
									</select>
								</div>
							)}

							{/* Monthly: Day of Month */}
							{formData.frequency === 'monthly' && (
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
										Day of Month
									</label>
									<input
										type='number'
										min={1}
										max={31}
										value={formData.day_of_month ?? 1}
										onChange={e =>
											setFormData({
												...formData,
												day_of_month: parseInt(e.target.value),
											})
										}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
									/>
								</div>
							)}

							{/* Backup Type & Storage */}
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
										Type
									</label>
									<select
										value={formData.backup_type}
										onChange={e =>
											setFormData({
												...formData,
												backup_type: e.target.value as BackupType,
											})
										}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
									>
										<option value='full'>Full Backup</option>
										<option value='database'>Database Only</option>
										<option value='files'>Files Only</option>
									</select>
								</div>

								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
										Storage
									</label>
									<select
										value={formData.storage_type}
										onChange={e =>
											setFormData({
												...formData,
												storage_type: e.target.value as BackupStorageType,
											})
										}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
									>
										<option value='google_drive'>Google Drive</option>
										<option value='local'>Local Storage</option>
										<option value='s3'>AWS S3</option>
									</select>
								</div>
							</div>

							{/* Path Preview */}
							<div className='bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-100 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300 font-mono'>
								<span className='font-bold'>Path Preview:</span>{' '}
								{getPathPreview()}
							</div>

							{/* S3 Config */}
							{formData.storage_type === 's3' && (
								<div className='grid grid-cols-2 gap-4'>
									<div>
										<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
											S3 Bucket
										</label>
										<input
											type='text'
											value={s3Config.bucket}
											onChange={e =>
												setS3Config({ ...s3Config, bucket: e.target.value })
											}
											className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
											placeholder='my-backup-bucket'
										/>
									</div>
									<div>
										<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
											Remote Name
										</label>
										<input
											type='text'
											value={s3Config.remote}
											onChange={e =>
												setS3Config({ ...s3Config, remote: e.target.value })
											}
											className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
											placeholder='s3'
										/>
										<p className='text-xs text-gray-500 mt-1'>
											Defined in Settings &gt; Integrations
										</p>
									</div>
								</div>
							)}

							{/* Retention */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Retention (Count)
								</label>
								<input
									type='number'
									min={1}
									max={365}
									value={formData.retention_count}
									onChange={e =>
										setFormData({
											...formData,
											retention_count: parseInt(e.target.value),
										})
									}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 focus:ring-2 focus:ring-indigo-500'
								/>
								<p className='text-xs text-gray-500 mt-1'>
									Number of backups to keep.
								</p>
							</div>
						</div>

						<div className='p-5 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3'>
							<Button
								onClick={() => {
									setShowCreateModal(false);
									setEditingSchedule(null);
									resetForm();
								}}
								variant='secondary'
							>
								Cancel
							</Button>
							<Button
								onClick={
									editingSchedule ? handleUpdateSchedule : handleCreateSchedule
								}
								disabled={actionLoading !== null}
								variant='primary'
							>
								{actionLoading !== null && (
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
								)}
								{editingSchedule ? 'Update' : 'Create'}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default BackupSchedulePanel;
