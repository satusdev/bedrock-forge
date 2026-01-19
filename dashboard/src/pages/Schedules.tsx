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
import { dashboardApi } from '../services/api';
import {
	BackupSchedule,
	ScheduleCreateInput,
	ScheduleFrequency,
	BackupType,
	BackupStorageType,
} from '../types';
import toast from 'react-hot-toast';

interface Project {
	id: number;
	name: string;
}

const Schedules: React.FC = () => {
	const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [editingSchedule, setEditingSchedule] = useState<BackupSchedule | null>(
		null
	);
	const [actionLoading, setActionLoading] = useState<number | null>(null);

	// Form state
	const [formData, setFormData] = useState<ScheduleCreateInput>({
		name: '',
		project_id: 0,
		frequency: 'daily',
		hour: 2,
		minute: 0,
		backup_type: 'full',
		storage_type: 'google_drive',
		retention_count: 7,
		description: '',
	});

	useEffect(() => {
		fetchSchedules();
		fetchProjects();
	}, []);

	const fetchSchedules = async () => {
		try {
			setLoading(true);
			const response = await dashboardApi.getSchedules();
			setSchedules(response.data.items || []);
		} catch (error) {
			console.error('Failed to fetch schedules:', error);
			toast.error('Failed to load schedules');
		} finally {
			setLoading(false);
		}
	};

	const fetchProjects = async () => {
		try {
			const response = await dashboardApi.getProjects();
			setProjects(response.data || []);
		} catch (error) {
			console.error('Failed to fetch projects:', error);
		}
	};

	const handleCreateSchedule = async () => {
		if (!formData.name || !formData.project_id) {
			toast.error('Please fill in required fields');
			return;
		}

		try {
			setActionLoading(-1);
			await dashboardApi.createSchedule(formData);
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
			await dashboardApi.updateSchedule(editingSchedule.id, formData);
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
			project_id: 0,
			frequency: 'daily',
			hour: 2,
			minute: 0,
			backup_type: 'full',
			storage_type: 'google_drive',
			retention_count: 7,
			description: '',
		});
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
		});
	};

	const formatNextRun = (nextRun?: string) => {
		if (!nextRun) return 'Not scheduled';
		const date = new Date(nextRun);
		const now = new Date();
		const diff = date.getTime() - now.getTime();

		if (diff < 0) return 'Overdue';
		if (diff < 3600000) return `In ${Math.round(diff / 60000)} min`;
		if (diff < 86400000) return `In ${Math.round(diff / 3600000)} hours`;
		return date.toLocaleDateString();
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
			<div className='flex justify-between items-center'>
				<h1 className='text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
					<Calendar className='h-6 w-6 text-indigo-600' />
					Backup Schedules
				</h1>
				<div className='flex gap-2'>
					<button
						onClick={fetchSchedules}
						className='p-2 text-gray-500 hover:text-indigo-600 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors'
						title='Refresh'
					>
						<RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
					</button>
					<button
						onClick={() => {
							resetForm();
							setShowCreateModal(true);
						}}
						className='px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-colors shadow-sm'
					>
						<Plus className='h-4 w-4' />
						New Schedule
					</button>
				</div>
			</div>

			{loading ? (
				<div className='flex items-center justify-center py-16'>
					<Loader2 className='h-8 w-8 animate-spin text-indigo-600' />
				</div>
			) : schedules.length > 0 ? (
				<div className='grid grid-cols-1 gap-4'>
					{schedules.map(schedule => (
						<div
							key={schedule.id}
							className='bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700'
						>
							<div className='flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4'>
								<div className='flex items-start gap-4 flex-1'>
									<div
										className={`p-3 rounded-lg ${
											schedule.status === 'active'
												? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
												: 'bg-gray-50 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
										}`}
									>
										<Clock className='h-6 w-6' />
									</div>
									<div className='flex-1 min-w-0'>
										<div className='flex items-center gap-2 flex-wrap'>
											<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
												{schedule.name}
											</h3>
											{getStatusIcon(schedule)}
											{schedule.status === 'paused' && (
												<span className='text-xs font-normal px-2 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded'>
													Paused
												</span>
											)}
										</div>
										<p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
											{schedule.project_name ||
												`Project #${schedule.project_id}`}
										</p>
										<div className='text-sm text-gray-500 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1'>
											<span className='flex items-center gap-1'>
												<Calendar className='h-3.5 w-3.5' />
												{schedule.cron_display || schedule.frequency}
											</span>
											<span>{getBackupTypeLabel(schedule.backup_type)}</span>
											<span>{getStorageTypeLabel(schedule.storage_type)}</span>
											<span className='text-indigo-600 dark:text-indigo-400'>
												Next: {formatNextRun(schedule.next_run_at)}
											</span>
										</div>
										{schedule.last_run_error && (
											<p className='text-xs text-red-500 mt-2 truncate max-w-md'>
												Last error: {schedule.last_run_error}
											</p>
										)}
									</div>
								</div>

								<div className='flex items-center gap-1 shrink-0'>
									<span className='text-xs text-gray-400 mr-2'>
										{schedule.run_count} runs, {schedule.failure_count} failed
									</span>
									<button
										onClick={() => handleRunNow(schedule.id)}
										disabled={actionLoading === schedule.id}
										className='p-2 text-gray-400 hover:text-indigo-600 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded-lg transition-all disabled:opacity-50'
										title='Run Now'
									>
										{actionLoading === schedule.id ? (
											<Loader2 className='h-5 w-5 animate-spin' />
										) : (
											<Play className='h-5 w-5' />
										)}
									</button>
									<button
										onClick={() => openEditModal(schedule)}
										className='p-2 text-gray-400 hover:text-blue-600 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded-lg transition-all'
										title='Edit'
									>
										<Edit className='h-5 w-5' />
									</button>
									<button
										onClick={() => handleToggleStatus(schedule)}
										disabled={actionLoading === schedule.id}
										className={`p-2 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded-lg transition-all disabled:opacity-50 ${
											schedule.status === 'active'
												? 'text-green-500 hover:text-yellow-500'
												: 'text-gray-400 hover:text-green-500'
										}`}
										title={schedule.status === 'active' ? 'Pause' : 'Resume'}
									>
										<Power className='h-5 w-5' />
									</button>
									<button
										onClick={() => handleDeleteSchedule(schedule.id)}
										disabled={actionLoading === schedule.id}
										className='p-2 text-gray-400 hover:text-red-600 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded-lg transition-all disabled:opacity-50'
										title='Delete'
									>
										<Trash2 className='h-5 w-5' />
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-16'>
					<div className='flex flex-col items-center justify-center text-gray-400'>
						<Calendar className='w-12 h-12 mb-3 text-gray-300' />
						<p className='text-sm font-medium'>No backup schedules</p>
						<p className='text-xs mt-1'>
							Create your first schedule to automate your backups
						</p>
					</div>
				</div>
			)}

			{/* Create/Edit Modal */}
			{(showCreateModal || editingSchedule) && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
					<div className='bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto'>
						<div className='p-6 border-b border-gray-100 dark:border-gray-700'>
							<h2 className='text-xl font-bold text-gray-900 dark:text-white'>
								{editingSchedule ? 'Edit Schedule' : 'Create New Schedule'}
							</h2>
						</div>

						<div className='p-6 space-y-4'>
							{/* Name */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Schedule Name *
								</label>
								<input
									type='text'
									value={formData.name}
									onChange={e =>
										setFormData({ ...formData, name: e.target.value })
									}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
									placeholder='Daily Production Backup'
								/>
							</div>

							{/* Project */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Project *
								</label>
								<select
									value={formData.project_id}
									onChange={e =>
										setFormData({
											...formData,
											project_id: parseInt(e.target.value),
										})
									}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
									disabled={!!editingSchedule}
								>
									<option value={0}>Select a project...</option>
									{projects.map(project => (
										<option key={project.id} value={project.id}>
											{project.name}
										</option>
									))}
								</select>
							</div>

							{/* Frequency */}
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
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
								>
									<option value='hourly'>Hourly</option>
									<option value='daily'>Daily</option>
									<option value='weekly'>Weekly</option>
									<option value='monthly'>Monthly</option>
								</select>
							</div>

							{/* Time */}
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
										Hour (0-23)
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
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
									/>
								</div>
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
										Minute (0-59)
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
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
									/>
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
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
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
										Day of Month (1-31)
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
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
									/>
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
									<option value='full'>Full Backup (Database + Files)</option>
									<option value='database'>Database Only</option>
									<option value='files'>Files Only</option>
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
									<option value='google_drive'>Google Drive</option>
									<option value='local'>Local Storage</option>
									<option value='s3'>AWS S3</option>
								</select>
							</div>

							{/* Retention */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Keep Last N Backups
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
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
								/>
								<p className='text-xs text-gray-500 mt-1'>
									Older backups will be automatically deleted
								</p>
							</div>

							{/* Description */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Description (optional)
								</label>
								<textarea
									value={formData.description || ''}
									onChange={e =>
										setFormData({ ...formData, description: e.target.value })
									}
									rows={2}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500'
									placeholder='Optional notes about this schedule...'
								/>
							</div>
						</div>

						<div className='p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3'>
							<button
								onClick={() => {
									setShowCreateModal(false);
									setEditingSchedule(null);
									resetForm();
								}}
								className='px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
							>
								Cancel
							</button>
							<button
								onClick={
									editingSchedule ? handleUpdateSchedule : handleCreateSchedule
								}
								disabled={actionLoading !== null}
								className='px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2'
							>
								{actionLoading !== null && (
									<Loader2 className='h-4 w-4 animate-spin' />
								)}
								{editingSchedule ? 'Update Schedule' : 'Create Schedule'}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Schedules;
