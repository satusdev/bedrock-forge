import React, { useState, useEffect } from 'react';
import {
	Cloud,
	FolderOpen,
	Image,
	FileText,
	Archive,
	Upload,
	Link2,
	ExternalLink,
	RefreshCw,
	CheckCircle,
	XCircle,
	Loader2,
	Plus,
} from 'lucide-react';
import { apiFetch } from '@/config/env';

interface DriveFolder {
	id: string;
	name: string;
	type: 'assets' | 'docs' | 'backups';
	fileCount: number;
	lastModified?: string;
}

interface DriveFile {
	id: string;
	name: string;
	mimeType: string;
	size: string;
	webViewLink: string;
}

interface ProjectDrivePanelProps {
	projectName: string;
	projectSlug: string;
	gdriveFolderId?: string;
	gdriveAssetsFolderId?: string;
	gdriveDocsFolderId?: string;
	gdriveBackupsFolderId?: string;
	gdriveConnected?: boolean;
}

const ProjectDrivePanel: React.FC<ProjectDrivePanelProps> = ({
	projectName,
	projectSlug,
	gdriveFolderId,
	gdriveAssetsFolderId,
	gdriveDocsFolderId,
	gdriveBackupsFolderId,
	gdriveConnected,
}) => {
	const [isConnected, setIsConnected] = useState(gdriveConnected || false);
	const [isLoading, setIsLoading] = useState(false);
	const [isInitializing, setIsInitializing] = useState(false);
	const [activeFolder, setActiveFolder] = useState<
		'assets' | 'docs' | 'backups'
	>('assets');
	const [files, setFiles] = useState<DriveFile[]>([]);
	const [error, setError] = useState<string | null>(null);

	const folders: DriveFolder[] = [
		{
			id: gdriveAssetsFolderId || '',
			name: 'Assets',
			type: 'assets',
			fileCount: 0,
		},
		{
			id: gdriveDocsFolderId || '',
			name: 'Documents',
			type: 'docs',
			fileCount: 0,
		},
		{
			id: gdriveBackupsFolderId || '',
			name: 'Backups',
			type: 'backups',
			fileCount: 0,
		},
	];

	useEffect(() => {
		if (isConnected && folders.find(f => f.type === activeFolder)?.id) {
			loadFolderContents();
		}
	}, [activeFolder, isConnected]);

	const loadFolderContents = async () => {
		const folder = folders.find(f => f.type === activeFolder);
		if (!folder?.id) return;

		setIsLoading(true);
		setError(null);

		try {
			const endpoint =
				activeFolder === 'assets'
					? `/api/v1/gdrive/projects/${projectSlug}/assets?folder_id=${folder.id}`
					: `/api/v1/gdrive/projects/${projectSlug}/docs?folder_id=${folder.id}`;

			const res = await apiFetch(endpoint);
			if (res.ok) {
				const data = await res.json();
				setFiles(data.assets || data.docs || []);
			}
		} catch (err) {
			setError('Failed to load folder contents');
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	const initializeDriveFolders = async () => {
		setIsInitializing(true);
		setError(null);

		try {
			const res = await apiFetch(
				`/api/v1/gdrive/projects/${projectSlug}/initialize`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
				},
			);

			if (res.ok) {
				const data = await res.json();
				setIsConnected(true);
				// Refresh the page or update parent state
				window.location.reload();
			} else {
				throw new Error('Failed to initialize folders');
			}
		} catch (err) {
			setError('Failed to initialize Google Drive folders');
			console.error(err);
		} finally {
			setIsInitializing(false);
		}
	};

	const openInDrive = (folderId?: string) => {
		const id = folderId || gdriveFolderId;
		if (id) {
			window.open(`https://drive.google.com/drive/folders/${id}`, '_blank');
		}
	};

	const getFolderIcon = (type: string) => {
		switch (type) {
			case 'assets':
				return Image;
			case 'docs':
				return FileText;
			case 'backups':
				return Archive;
			default:
				return FolderOpen;
		}
	};

	// Not connected state
	if (!isConnected && !gdriveFolderId) {
		return (
			<div className='bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center space-x-4'>
						<div className='w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center'>
							<Cloud className='w-6 h-6 text-blue-600' />
						</div>
						<div>
							<h3 className='font-semibold text-gray-900'>
								Google Drive Integration
							</h3>
							<p className='text-sm text-gray-600'>
								Connect to store assets, documents, and backups
							</p>
						</div>
					</div>
					<button
						onClick={initializeDriveFolders}
						disabled={isInitializing}
						className='flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50'
					>
						{isInitializing ? (
							<>
								<Loader2 className='w-4 h-4 mr-2 animate-spin' />
								Initializing...
							</>
						) : (
							<>
								<Plus className='w-4 h-4 mr-2' />
								Setup Drive Folders
							</>
						)}
					</button>
				</div>
				{error && <div className='mt-4 text-sm text-red-600'>{error}</div>}
			</div>
		);
	}

	return (
		<div className='bg-white border border-gray-200 rounded-xl overflow-hidden'>
			{/* Header */}
			<div className='bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center space-x-3 text-white'>
						<Cloud className='w-5 h-5' />
						<h3 className='font-semibold'>Google Drive</h3>
						<span className='flex items-center text-xs bg-white/20 px-2 py-1 rounded-full'>
							<CheckCircle className='w-3 h-3 mr-1' />
							Connected
						</span>
					</div>
					<div className='flex items-center space-x-2'>
						<button
							onClick={loadFolderContents}
							className='p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg'
						>
							<RefreshCw className='w-4 h-4' />
						</button>
						<button
							onClick={() => openInDrive()}
							className='flex items-center px-3 py-1.5 text-sm text-white bg-white/20 hover:bg-white/30 rounded-lg'
						>
							<ExternalLink className='w-4 h-4 mr-1' />
							Open in Drive
						</button>
					</div>
				</div>
			</div>

			{/* Folder Tabs */}
			<div className='flex border-b border-gray-200'>
				{folders.map(folder => {
					const Icon = getFolderIcon(folder.type);
					return (
						<button
							key={folder.type}
							onClick={() => setActiveFolder(folder.type)}
							className={`flex-1 flex items-center justify-center py-3 px-4 text-sm font-medium transition-colors ${
								activeFolder === folder.type
									? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
									: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
							}`}
						>
							<Icon className='w-4 h-4 mr-2' />
							{folder.name}
						</button>
					);
				})}
			</div>

			{/* Content */}
			<div className='p-4'>
				{isLoading ? (
					<div className='flex items-center justify-center py-8'>
						<Loader2 className='w-6 h-6 animate-spin text-blue-500' />
						<span className='ml-2 text-gray-500'>Loading files...</span>
					</div>
				) : error ? (
					<div className='text-center py-8 text-red-500'>{error}</div>
				) : files.length > 0 ? (
					<div className='space-y-2'>
						{files.map(file => (
							<a
								key={file.id}
								href={file.webViewLink}
								target='_blank'
								rel='noopener noreferrer'
								className='flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors'
							>
								<div className='flex items-center'>
									{file.mimeType?.includes('image') ? (
										<Image className='w-5 h-5 text-green-500 mr-3' />
									) : file.mimeType?.includes('pdf') ? (
										<FileText className='w-5 h-5 text-red-500 mr-3' />
									) : (
										<FolderOpen className='w-5 h-5 text-blue-500 mr-3' />
									)}
									<span className='font-medium text-gray-700'>{file.name}</span>
								</div>
								<div className='flex items-center text-sm text-gray-400'>
									<span>{file.size}</span>
									<ExternalLink className='w-4 h-4 ml-2' />
								</div>
							</a>
						))}
					</div>
				) : (
					<div className='text-center py-8'>
						<FolderOpen className='w-12 h-12 text-gray-300 mx-auto mb-3' />
						<p className='text-gray-500'>No files in this folder yet</p>
						<button
							onClick={() =>
								openInDrive(folders.find(f => f.type === activeFolder)?.id)
							}
							className='mt-3 text-sm text-blue-600 hover:underline'
						>
							Open folder in Drive to add files
						</button>
					</div>
				)}
			</div>

			{/* Quick Actions */}
			<div className='border-t border-gray-200 px-4 py-3 bg-gray-50'>
				<div className='flex items-center justify-between text-sm'>
					<div className='flex items-center space-x-4'>
						<button
							onClick={() => openInDrive(gdriveAssetsFolderId)}
							className='flex items-center text-gray-600 hover:text-blue-600'
						>
							<Image className='w-4 h-4 mr-1' />
							Assets
						</button>
						<button
							onClick={() => openInDrive(gdriveDocsFolderId)}
							className='flex items-center text-gray-600 hover:text-blue-600'
						>
							<FileText className='w-4 h-4 mr-1' />
							Docs
						</button>
						<button
							onClick={() => openInDrive(gdriveBackupsFolderId)}
							className='flex items-center text-gray-600 hover:text-blue-600'
						>
							<Archive className='w-4 h-4 mr-1' />
							Backups
						</button>
					</div>
					<div className='flex items-center text-gray-400'>
						<Link2 className='w-4 h-4 mr-1' />
						<span className='text-xs font-mono'>
							{gdriveFolderId?.slice(0, 12)}...
						</span>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ProjectDrivePanel;
