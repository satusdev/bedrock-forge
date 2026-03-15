import { type ColumnDef } from '@tanstack/react-table';
import {
	CheckCircle,
	Clock,
	Cloud,
	Database,
	ExternalLink,
	HardDrive,
	Loader2,
	RotateCcw,
	Terminal,
	Trash2,
	XCircle,
} from 'lucide-react';

import type {
	Backup,
	BackupStatus,
	BackupStorageType,
	BackupType,
} from '@/types';

interface BackupsColumnsProps {
	actionLoading: number | null;
	onOpenLogs: (backup: Backup) => void;
	onOpenRestore: (backup: Backup) => void;
	onDelete: (backup: Backup) => void;
}

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

const formatDate = (dateStr: string) => {
	const date = new Date(dateStr);
	return date.toLocaleString();
};

const getStatusIcon = (status: BackupStatus | string) => {
	switch (status) {
		case 'completed':
			return <CheckCircle className='h-4 w-4 text-green-500' />;
		case 'failed':
			return <XCircle className='h-4 w-4 text-red-500' />;
		case 'running':
			return <Loader2 className='h-4 w-4 text-blue-500 animate-spin' />;
		default:
			return <Clock className='h-4 w-4 text-gray-400' />;
	}
};

const getBackupTypeLabel = (type: BackupType | string) => {
	const labels: Record<BackupType, string> = {
		full: 'Full',
		database: 'DB',
		files: 'Files',
	};
	return labels[type as BackupType] || type;
};

const getBackupTypeColor = (type: BackupType | string) => {
	const colors: Record<BackupType, string> = {
		full: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
		database: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
		files:
			'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
	};
	return colors[type as BackupType] || 'bg-gray-50 text-gray-700';
};

const getStorageIcon = (type: BackupStorageType | string) => {
	switch (type) {
		case 'google_drive':
			return <Cloud className='h-4 w-4' />;
		case 'local':
			return <HardDrive className='h-4 w-4' />;
		default:
			return <Database className='h-4 w-4' />;
	}
};

export function createBackupsColumns({
	actionLoading,
	onOpenLogs,
	onOpenRestore,
	onDelete,
}: BackupsColumnsProps): ColumnDef<Backup>[] {
	return [
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }) => (
				<div className='flex items-center gap-2'>
					{getStatusIcon(row.original.status)}
					<span className='text-xs capitalize text-gray-500'>
						{row.original.status}
					</span>
				</div>
			),
		},
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }) => (
				<div>
					<span className='font-medium text-gray-900 dark:text-gray-200 truncate max-w-xs block'>
						{row.original.name}
					</span>
					{row.original.error_message && (
						<span className='text-xs text-red-500 truncate block max-w-xs'>
							{row.original.error_message}
						</span>
					)}
				</div>
			),
		},
		{
			accessorKey: 'project_name',
			header: 'Project',
			cell: ({ row }) => (
				<span className='text-sm text-gray-600 dark:text-gray-300'>
					{row.original.project_name || `#${row.original.project_id}`}
				</span>
			),
		},
		{
			accessorKey: 'backup_type',
			header: 'Type',
			cell: ({ row }) => (
				<span
					className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getBackupTypeColor(
						row.original.backup_type,
					)}`}
				>
					{getBackupTypeLabel(row.original.backup_type)}
				</span>
			),
		},
		{
			accessorKey: 'size_bytes',
			header: 'Size',
			cell: ({ row }) => (
				<span className='text-sm text-gray-600 dark:text-gray-300'>
					{formatSize(row.original.size_bytes)}
				</span>
			),
		},
		{
			accessorKey: 'storage_type',
			header: 'Storage',
			cell: ({ row }) => (
				<div className='flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300'>
					{getStorageIcon(row.original.storage_type)}
					<span className='capitalize'>
						{row.original.storage_type.replace('_', ' ')}
					</span>
				</div>
			),
		},
		{
			accessorKey: 'created_at',
			header: 'Date',
			cell: ({ row }) => (
				<span className='text-sm text-gray-600 dark:text-gray-300'>
					{formatDate(row.original.created_at)}
				</span>
			),
		},
		{
			id: 'actions',
			header: () => <div className='text-right'>Actions</div>,
			cell: ({ row }) => {
				const backup = row.original;

				return (
					<div className='flex justify-end gap-1'>
						<button
							className='p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-700'
							title='View Logs'
							onClick={() => onOpenLogs(backup)}
						>
							<Terminal className='h-4 w-4' />
						</button>

						{backup.status === 'completed' && (
							<>
								{backup.storage_type === 'google_drive' &&
									(backup.gdrive_link ||
										backup.drive_folder_id ||
										backup.storage_file_id) && (
										<a
											href={
												backup.gdrive_link ||
												`https://drive.google.com/drive/folders/${
													backup.drive_folder_id || backup.storage_file_id
												}`
											}
											target='_blank'
											rel='noopener noreferrer'
											className='p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-700 block'
											title='Open in Google Drive'
											onClick={event => event.stopPropagation()}
										>
											<ExternalLink className='h-4 w-4' />
										</a>
									)}

								<button
									onClick={() => onOpenRestore(backup)}
									disabled={actionLoading === backup.id}
									className='p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50'
									title='Restore'
								>
									{actionLoading === backup.id ? (
										<Loader2 className='h-4 w-4 animate-spin' />
									) : (
										<RotateCcw className='h-4 w-4' />
									)}
								</button>
							</>
						)}

						<button
							onClick={() => onDelete(backup)}
							disabled={actionLoading === backup.id}
							className='p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50'
							title='Delete'
						>
							<Trash2 className='h-4 w-4' />
						</button>
					</div>
				);
			},
		},
	];
}
