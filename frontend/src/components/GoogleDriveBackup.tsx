import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	HardDrive,
	RefreshCw,
	AlertTriangle,
	CheckCircle,
	FolderOpen,
	ExternalLink,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DriveRestoreSelector from '@/components/DriveRestoreSelector';
import GoogleDriveFolderPicker from '@/components/GoogleDriveFolderPicker';
import { dashboardApi } from '@/services/api';
import toast from 'react-hot-toast';

interface GoogleDriveBackupProps {
	project: any;
}

const GoogleDriveBackup: React.FC<GoogleDriveBackupProps> = ({ project }) => {
	const queryClient = useQueryClient();
	const [showPicker, setShowPicker] = useState(false);
	const [downloading, setDownloading] = useState<string | null>(null);

	const projectId = project?.id;
	const projectName =
		project?.project_name || project?.name || project?.slug || '';

	const { data: driveStatus } = useQuery({
		queryKey: ['gdrive-status'],
		queryFn: dashboardApi.getDriveStatus,
		refetchInterval: 60000,
	});

	const { data: storageUsage } = useQuery({
		queryKey: ['gdrive-storage'],
		queryFn: dashboardApi.getDriveStorageUsage,
		enabled: !!driveStatus?.data?.configured,
		refetchInterval: 60000,
	});

	const { data: driveSettings } = useQuery({
		queryKey: ['project-drive', projectId],
		queryFn: () => dashboardApi.getProjectDriveSettings(projectId),
		enabled: !!projectId,
	});

	const { data: driveIndexData } = useQuery({
		queryKey: ['project-drive-backups-index', projectId],
		queryFn: () => dashboardApi.getProjectDriveBackupIndex(projectId),
		enabled: !!projectId,
	});

	const updateDriveSettings = useMutation({
		mutationFn: (path: string) =>
			dashboardApi.updateProjectDriveSettings(projectId, {
				gdrive_backups_folder_id: path,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['project-drive', projectId] });
			queryClient.invalidateQueries({
				queryKey: ['project-drive-backups-index', projectId],
			});
			setShowPicker(false);
			toast.success('Drive backup folder updated');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to update folder');
		},
	});

	const handleDownload = async (path: string) => {
		try {
			setDownloading(path);
			toast.loading('Starting download...', { id: 'download-toast' });
			const response = await dashboardApi.downloadProjectBackup(
				projectId,
				path,
				'gdrive',
			);

			// Trigger download
			const url = window.URL.createObjectURL(new Blob([response.data]));
			const link = document.createElement('a');
			link.href = url;
			link.setAttribute('download', path.split('/').pop() || 'backup');
			document.body.appendChild(link);
			link.click();
			link.parentNode?.removeChild(link);

			toast.success('Download started', { id: 'download-toast' });
		} catch (error) {
			console.error(error);
			toast.error('Download failed', { id: 'download-toast' });
		} finally {
			setDownloading(null);
		}
	};

	const configured = driveStatus?.data?.configured;
	const storage = storageUsage?.data?.storage_usage || {};
	const backupRoot =
		driveSettings?.data?.gdrive_backups_folder_id ||
		(projectName && driveStatus?.data?.base_path
			? `${driveStatus.data.base_path}/${projectName}/Backups`
			: '');

	const driveIndex = driveIndexData?.data?.environments || {};
	const backupEntries = useMemo(() => {
		const entries: Array<{
			environment: string;
			timestamp: string;
			db?: { name?: string; path?: string; link?: string } | null;
			files?: { name?: string; path?: string; link?: string } | null;
			folder_link?: string;
		}> = [];
		Object.entries(driveIndex).forEach(([environment, envEntries]) => {
			(envEntries as any[]).forEach(entry => {
				entries.push({
					environment,
					timestamp: entry.timestamp,
					db: entry.db,
					files: entry.files,
					folder_link: entry.folder_link,
				});
			});
		});
		return entries.sort((a, b) =>
			(b.timestamp || '').localeCompare(a.timestamp || ''),
		);
	}, [driveIndex]);

	const formatBytes = (bytes?: number) => {
		if (!bytes) return '0 B';
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(1024));
		return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
	};

	if (!projectId) {
		return (
			<div className='p-6'>
				<Card>
					<div className='text-sm text-gray-500'>Select a project.</div>
				</Card>
			</div>
		);
	}

	const FileActions = ({
		file,
	}: {
		file: { name?: string; path?: string; link?: string };
	}) => {
		if (!file || !file.path) return <span className='text-gray-400'>—</span>;

		return (
			<div className='flex items-center space-x-2'>
				<span className='truncate max-w-[150px]' title={file.name}>
					{file.name}
				</span>
				<div className='flex space-x-1'>
					{file.link && (
						<a
							href={file.link}
							target='_blank'
							rel='noopener noreferrer'
							className='p-1 text-gray-400 hover:text-blue-600 transition-colors'
							title='Open in Google Drive'
						>
							<HardDrive className='w-4 h-4' />
						</a>
					)}
					<button
						onClick={() => handleDownload(file.path!)}
						disabled={downloading === file.path}
						className={`p-1 text-gray-400 hover:text-green-600 transition-colors ${downloading === file.path ? 'opacity-50 cursor-wait' : ''}`}
						title='Download'
					>
						<FolderOpen className='w-4 h-4' />
					</button>
				</div>
			</div>
		);
	};

	return (
		<div className='space-y-6 p-6'>
			<Card title='Drive Status'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center space-x-3'>
						{configured ? (
							<CheckCircle className='w-5 h-5 text-green-600' />
						) : (
							<AlertTriangle className='w-5 h-5 text-amber-500' />
						)}
						<div>
							<div className='text-sm font-medium text-gray-900'>
								{configured ? 'Configured' : 'Not Configured'}
							</div>
							<div className='text-xs text-gray-500'>
								Remote: {driveStatus?.data?.remote_name || 'gdrive'}
								{driveStatus?.data?.base_path
									? ` • Base: ${driveStatus.data.base_path}`
									: ''}
							</div>
							{driveStatus?.data?.message && (
								<div className='text-xs text-gray-500'>
									{driveStatus.data.message}
								</div>
							)}
						</div>
					</div>
					<Button
						variant='secondary'
						onClick={() =>
							queryClient.invalidateQueries({ queryKey: ['gdrive-status'] })
						}
					>
						<RefreshCw className='w-4 h-4 mr-2' />
						Refresh
					</Button>
				</div>
			</Card>

			<Card title='Backup Folder'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center space-x-2 text-sm text-gray-700'>
						<FolderOpen className='w-4 h-4 text-gray-500' />
						<span>{backupRoot || 'Not set'}</span>
					</div>
					<Button variant='secondary' onClick={() => setShowPicker(true)}>
						Select Folder
					</Button>
				</div>
			</Card>

			{showPicker && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
					<GoogleDriveFolderPicker
						onSelect={(folderId: string) =>
							updateDriveSettings.mutate(folderId)
						}
						onCancel={() => setShowPicker(false)}
						initialFolderId={backupRoot || undefined}
					/>
				</div>
			)}

			<Card title='Storage Usage'>
				<div className='space-y-2'>
					<div className='flex items-center justify-between text-sm'>
						<span className='text-gray-600'>Used</span>
						<span className='text-gray-900'>
							{formatBytes(storage.usage)} / {formatBytes(storage.limit)}
						</span>
					</div>
					<div className='flex items-center justify-between text-xs text-gray-500'>
						<span>Drive</span>
						<span>{formatBytes(storage.usage_in_drive)}</span>
					</div>
					<div className='flex items-center justify-between text-xs text-gray-500'>
						<span>Trash</span>
						<span>{formatBytes(storage.usage_in_drive_trash)}</span>
					</div>
				</div>
			</Card>

			<Card title='Drive Backups'>
				{backupEntries.length === 0 ? (
					<div className='text-sm text-gray-500'>No backups found.</div>
				) : (
					<div className='space-y-3'>
						{backupEntries.map(entry => (
							<div
								key={`${entry.environment}-${entry.timestamp}`}
								className='flex items-center justify-between rounded-lg border border-gray-200 p-3'
							>
								<div>
									<div className='flex items-center gap-2 mb-2'>
										<Badge variant='info'>{entry.environment}</Badge>
										{entry.folder_link && (
											<a
												href={entry.folder_link}
												target='_blank'
												rel='noopener noreferrer'
												className='text-gray-400 hover:text-blue-600 transition-colors'
												title='Open environment folder'
											>
												<ExternalLink className='w-3.5 h-3.5' />
											</a>
										)}
										<span className='text-sm font-medium text-gray-900'>
											{entry.timestamp}
										</span>
									</div>
									<div className='grid grid-cols-2 gap-4 text-sm'>
										<div className='flex items-center gap-2'>
											<span className='text-gray-500 text-xs uppercase w-8'>
												DB:
											</span>
											<FileActions file={entry.db || {}} />
										</div>
										<div className='flex items-center gap-2'>
											<span className='text-gray-500 text-xs uppercase w-8'>
												Files:
											</span>
											<FileActions file={entry.files || {}} />
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			<DriveRestoreSelector projectId={projectId} projectName={projectName} />
		</div>
	);
};

export default GoogleDriveBackup;
