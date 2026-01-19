import React, { useState, useEffect, useCallback } from 'react';
import {
	Folder,
	FolderOpen,
	ChevronRight,
	Home,
	RefreshCw,
	Plus,
	Check,
	X,
	Loader2,
	HardDrive,
} from 'lucide-react';
import { dashboardApi } from '../services/api';
import toast from 'react-hot-toast';

interface DriveFile {
	id: string;
	name: string;
	mimeType: string;
	modifiedTime?: string;
	size?: number;
}

interface BreadcrumbItem {
	id: string | null;
	name: string;
}

interface GoogleDriveFolderPickerProps {
	onSelect: (folderId: string, folderName: string, path: string) => void;
	onCancel: () => void;
	initialFolderId?: string;
}

export const GoogleDriveFolderPicker: React.FC<
	GoogleDriveFolderPickerProps
> = ({ onSelect, onCancel, initialFolderId }) => {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [loading, setLoading] = useState(true);
	const [folders, setFolders] = useState<DriveFile[]>([]);
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(
		initialFolderId || null
	);
	const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
		{ id: null, name: 'My Drive' },
	]);
	const [selectedFolder, setSelectedFolder] = useState<DriveFile | null>(null);
	const [newFolderName, setNewFolderName] = useState('');
	const [showNewFolderInput, setShowNewFolderInput] = useState(false);
	const [creatingFolder, setCreatingFolder] = useState(false);

	// Check auth status
	useEffect(() => {
		const checkAuth = async () => {
			try {
				const response = await dashboardApi.getGoogleDriveAuthStatus();
				setIsAuthenticated(response.data?.authenticated || false);
			} catch (error) {
				console.error('Failed to check Google Drive auth:', error);
				setIsAuthenticated(false);
			}
		};
		checkAuth();
	}, []);

	// Load folders
	const loadFolders = useCallback(async () => {
		if (!isAuthenticated) {
			setLoading(false);
			return;
		}

		setLoading(true);
		try {
			const response = await dashboardApi.listDriveFiles(
				currentFolderId || undefined,
				['application/vnd.google-apps.folder']
			);
			const files = response.data?.files || [];
			// Filter only folders
			const folderList = files.filter(
				(f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder'
			);
			setFolders(folderList);
		} catch (error) {
			console.error('Failed to load folders:', error);
			toast.error('Failed to load Google Drive folders');
		} finally {
			setLoading(false);
		}
	}, [isAuthenticated, currentFolderId]);

	useEffect(() => {
		loadFolders();
	}, [loadFolders]);

	// Navigate into a folder
	const handleFolderDoubleClick = (folder: DriveFile) => {
		setCurrentFolderId(folder.id);
		setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
		setSelectedFolder(null);
	};

	// Navigate via breadcrumb
	const handleBreadcrumbClick = (index: number) => {
		const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
		setBreadcrumbs(newBreadcrumbs);
		setCurrentFolderId(newBreadcrumbs[newBreadcrumbs.length - 1].id);
		setSelectedFolder(null);
	};

	// Select folder
	const handleFolderClick = (folder: DriveFile) => {
		setSelectedFolder(folder);
	};

	// Confirm selection
	const handleConfirm = () => {
		if (selectedFolder) {
			const path =
				breadcrumbs.map(b => b.name).join('/') + '/' + selectedFolder.name;
			onSelect(selectedFolder.id, selectedFolder.name, path);
		} else {
			// Select current folder
			const currentFolder = breadcrumbs[breadcrumbs.length - 1];
			const path = breadcrumbs.map(b => b.name).join('/');
			onSelect(currentFolder.id || 'root', currentFolder.name, path);
		}
	};

	// Create new folder
	const handleCreateFolder = async () => {
		if (!newFolderName.trim()) {
			toast.error('Please enter a folder name');
			return;
		}

		setCreatingFolder(true);
		try {
			const response = await dashboardApi.createDriveFolder(
				newFolderName.trim(),
				currentFolderId || undefined
			);
			if (response.data) {
				toast.success('Folder created successfully');
				setNewFolderName('');
				setShowNewFolderInput(false);
				await loadFolders();
				// Select the newly created folder
				setSelectedFolder({
					id: response.data.id,
					name: newFolderName.trim(),
					mimeType: 'application/vnd.google-apps.folder',
				});
			}
		} catch (error) {
			console.error('Failed to create folder:', error);
			toast.error('Failed to create folder');
		} finally {
			setCreatingFolder(false);
		}
	};

	// Start Google Drive authentication
	const handleAuthenticate = async () => {
		try {
			const currentUrl = window.location.href;
			const response = await dashboardApi.getGoogleDriveAuthUrl(currentUrl);
			if (response.data?.url) {
				// Store current state for restoration after OAuth
				sessionStorage.setItem('gdrive_picker_active', 'true');
				window.location.href = response.data.url;
			}
		} catch (error) {
			console.error('Failed to get auth URL:', error);
			toast.error('Failed to start Google Drive authentication');
		}
	};

	// Get current folder path
	const getCurrentPath = () => {
		return breadcrumbs.map(b => b.name).join('/');
	};

	if (!isAuthenticated) {
		return (
			<div className='bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-lg mx-auto'>
				<div className='text-center'>
					<HardDrive className='w-16 h-16 mx-auto text-gray-400 mb-4' />
					<h3 className='text-lg font-medium text-gray-900 dark:text-white mb-2'>
						Connect Google Drive
					</h3>
					<p className='text-gray-600 dark:text-gray-400 mb-4'>
						Connect your Google Drive account to select a backup folder.
					</p>
					<div className='flex gap-3 justify-center'>
						<button
							onClick={onCancel}
							className='px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
						>
							Cancel
						</button>
						<button
							onClick={handleAuthenticate}
							className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2'
						>
							<HardDrive className='w-4 h-4' />
							Connect Google Drive
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className='bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-2xl mx-auto'>
			{/* Header */}
			<div className='px-4 py-3 border-b border-gray-200 dark:border-gray-700'>
				<div className='flex items-center justify-between'>
					<h3 className='text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2'>
						<HardDrive className='w-5 h-5 text-blue-500' />
						Select Google Drive Folder
					</h3>
					<button
						onClick={loadFolders}
						disabled={loading}
						className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
						title='Refresh'
					>
						<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
					</button>
				</div>

				{/* Breadcrumbs */}
				<div className='flex items-center gap-1 mt-2 text-sm overflow-x-auto'>
					{breadcrumbs.map((crumb, index) => (
						<React.Fragment key={crumb.id || 'root'}>
							{index > 0 && (
								<ChevronRight className='w-4 h-4 text-gray-400 flex-shrink-0' />
							)}
							<button
								onClick={() => handleBreadcrumbClick(index)}
								className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0 ${
									index === breadcrumbs.length - 1
										? 'text-blue-600 dark:text-blue-400 font-medium'
										: 'text-gray-600 dark:text-gray-400'
								}`}
							>
								{index === 0 && <Home className='w-4 h-4' />}
								{crumb.name}
							</button>
						</React.Fragment>
					))}
				</div>
			</div>

			{/* Folder List */}
			<div className='p-4 max-h-80 overflow-y-auto'>
				{loading ? (
					<div className='flex items-center justify-center py-8'>
						<Loader2 className='w-8 h-8 animate-spin text-blue-500' />
					</div>
				) : folders.length === 0 ? (
					<div className='text-center py-8 text-gray-500 dark:text-gray-400'>
						<Folder className='w-12 h-12 mx-auto mb-2 opacity-50' />
						<p>No folders found</p>
						<p className='text-sm'>
							Create a new folder or select current location
						</p>
					</div>
				) : (
					<div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
						{folders.map(folder => (
							<button
								key={folder.id}
								onClick={() => handleFolderClick(folder)}
								onDoubleClick={() => handleFolderDoubleClick(folder)}
								className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
									selectedFolder?.id === folder.id
										? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
										: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
								}`}
							>
								{selectedFolder?.id === folder.id ? (
									<FolderOpen className='w-5 h-5 text-blue-500 flex-shrink-0' />
								) : (
									<Folder className='w-5 h-5 text-yellow-500 flex-shrink-0' />
								)}
								<span className='truncate text-sm text-gray-900 dark:text-white'>
									{folder.name}
								</span>
							</button>
						))}
					</div>
				)}
			</div>

			{/* New Folder Input */}
			{showNewFolderInput && (
				<div className='px-4 pb-2'>
					<div className='flex items-center gap-2'>
						<input
							type='text'
							value={newFolderName}
							onChange={e => setNewFolderName(e.target.value)}
							placeholder='New folder name'
							className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
							onKeyDown={e => {
								if (e.key === 'Enter') handleCreateFolder();
								if (e.key === 'Escape') {
									setShowNewFolderInput(false);
									setNewFolderName('');
								}
							}}
							autoFocus
						/>
						<button
							onClick={handleCreateFolder}
							disabled={creatingFolder || !newFolderName.trim()}
							className='p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50'
						>
							{creatingFolder ? (
								<Loader2 className='w-4 h-4 animate-spin' />
							) : (
								<Check className='w-4 h-4' />
							)}
						</button>
						<button
							onClick={() => {
								setShowNewFolderInput(false);
								setNewFolderName('');
							}}
							className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
						>
							<X className='w-4 h-4' />
						</button>
					</div>
				</div>
			)}

			{/* Footer */}
			<div className='px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg'>
				<div className='flex items-center justify-between'>
					<button
						onClick={() => setShowNewFolderInput(true)}
						disabled={showNewFolderInput}
						className='flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50'
					>
						<Plus className='w-4 h-4' />
						New Folder
					</button>

					<div className='flex items-center gap-2'>
						{selectedFolder && (
							<span className='text-sm text-gray-500 dark:text-gray-400 mr-2'>
								Selected:{' '}
								<span className='font-medium'>{selectedFolder.name}</span>
							</span>
						)}
						<button
							onClick={onCancel}
							className='px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
						>
							Cancel
						</button>
						<button
							onClick={handleConfirm}
							className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2'
						>
							<Check className='w-4 h-4' />
							{selectedFolder ? 'Select Folder' : 'Select Current Folder'}
						</button>
					</div>
				</div>

				{/* Show selected path */}
				<div className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
					Path: {getCurrentPath()}
					{selectedFolder ? '/' + selectedFolder.name : ''}
				</div>
			</div>
		</div>
	);
};

export default GoogleDriveFolderPicker;
