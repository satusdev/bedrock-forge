import React, { useEffect, useState } from 'react';
import {
	Folder,
	FolderOpen,
	Search,
	X,
	HardDrive,
	Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi } from '../services/api';

interface DriveFolderResult {
	id?: string | null;
	name?: string;
	path: string;
	display_path?: string;
	parent_path?: string | null;
	drive_type?: 'my_drive' | 'shared_with_me';
	source?: 'base' | 'shared';
}

interface GoogleDriveFolderPickerProps {
	onSelect: (folderId: string, folderName: string, path: string) => void;
	onCancel: () => void;
	initialFolderId?: string;
}

const GoogleDriveFolderPicker: React.FC<GoogleDriveFolderPickerProps> = ({
	onSelect,
	onCancel,
	initialFolderId,
}) => {
	const [results, setResults] = useState<DriveFolderResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [currentPath, setCurrentPath] = useState(''); // Tracking navigation path
	const [searchQuery, setSearchQuery] = useState(''); // Tracking search input
	const [defaultPath, setDefaultPath] = useState('');

	// Load initial folders from selected/default/base path
	useEffect(() => {
		initializePicker();
	}, []);

	const initializePicker = async () => {
		try {
			const response = await dashboardApi.getDriveStatus();
			const statusBasePath = (response.data?.base_path || '').trim();
			if (statusBasePath) {
				setDefaultPath(statusBasePath);
			}

			const initialTarget = (initialFolderId || statusBasePath || '').trim();
			setSearchQuery(initialTarget);
			if (initialTarget) {
				const folders = await loadFolders({ path: initialTarget });
				if (folders.length === 0 && initialTarget.includes('/')) {
					await loadFolders({ query: initialTarget });
				}
				return;
			}

			await loadFolders({ path: '' });
		} catch (e) {
			console.error('Failed to check Drive status', e);
			await loadFolders({ path: '' });
		}
	};

	const loadFolders = async (payload: { path?: string; query?: string }) => {
		setIsLoading(true);
		setResults([]); // Clear previous results to indicate loading
		try {
			const params: any = {
				max_results: 50,
				shared_with_me: true, // Always check shared items
			};
			const nextPath = (payload.path || '').trim();
			const nextQuery = (payload.query || '').trim();

			if (nextQuery) {
				params.query = nextQuery;
			} else if (nextPath) {
				params.path = nextPath;
			}

			const response = await dashboardApi.listDriveFolders(params);
			const folders = response.data?.folders || [];
			setResults(folders);
			if (nextPath && !nextQuery) {
				setCurrentPath(nextPath);
				setSearchQuery(nextPath);
			} else if (!nextQuery) {
				setCurrentPath('');
			}
			return folders;
		} catch (error) {
			console.error('Failed to load folders:', error);
			toast.error('Failed to load folders');
			return [] as DriveFolderResult[];
		} finally {
			setIsLoading(false);
		}
	};

	const handleSearch = async () => {
		const input = searchQuery.trim();
		if (!input) {
			await loadFolders({ path: '' });
			return;
		}

		if (input.includes('/')) {
			const pathResults = await loadFolders({ path: input });
			if (pathResults.length === 0) {
				await loadFolders({ query: input });
			}
			return;
		}

		await loadFolders({ query: input });
	};

	const handleNavigate = (path: string) => {
		setSearchQuery(path);
		loadFolders({ path });
	};

	const handleBreadcrumbClick = (index: number, parts: string[]) => {
		// e.g. parts=["WebDev", "Projects"] -> index=0 -> "WebDev"
		const newPath = parts.slice(0, index + 1).join('/');
		handleNavigate(newPath);
	};

	const handleSelect = (folder: DriveFolderResult) => {
		const folderId = (folder.id || folder.path || '').trim();
		const folderPath = (folder.display_path || folder.path || folderId).trim();
		const folderName = (
			folder.name ||
			folderPath.split('/').pop() ||
			folderId
		).trim();
		onSelect(folderId, folderName, folderPath);
	};

	const handleUseDefault = () => {
		if (defaultPath) {
			onSelect(
				defaultPath,
				defaultPath.split('/').pop() || defaultPath,
				defaultPath,
			);
		}
	};

	return (
		<div className='bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-2xl mx-auto'>
			<div className='px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<HardDrive className='w-5 h-5 text-gray-500' />
					<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
						Select Drive Folder
					</h3>
				</div>
				<button
					onClick={onCancel}
					className='text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
				>
					<X className='w-5 h-5' />
				</button>
			</div>

			<div className='p-4 space-y-4'>
				<div>
					<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
						Current Path / Search
					</label>
					<div className='flex gap-2'>
						<div className='relative flex-1'>
							<Search className='w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2' />
							<input
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
								placeholder='Path (e.g. WebDev/Projects) or Search Name'
								className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white'
								onKeyDown={e => {
									if (e.key === 'Enter') handleSearch();
								}}
							/>
						</div>
						<button
							onClick={handleSearch}
							className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50'
							disabled={isLoading}
						>
							{isLoading ? <Loader2 className='w-4 h-4 animate-spin' /> : 'Go'}
						</button>
					</div>

					{/* Breadcrumbs */}
					{currentPath && (
						<div className='mt-2 flex items-center text-sm text-gray-500 overflow-x-auto pb-1'>
							<span
								className='cursor-pointer hover:text-blue-600 hover:underline mr-1 font-medium'
								onClick={() => handleNavigate('')}
							>
								Root
							</span>
							{currentPath.split('/').map((part, index, arr) => (
								<React.Fragment key={index}>
									<span className='mx-1 text-gray-400'>/</span>
									<span
										className='cursor-pointer hover:text-blue-600 hover:underline whitespace-nowrap'
										onClick={() => handleBreadcrumbClick(index, arr)}
									>
										{part}
									</span>
								</React.Fragment>
							))}
						</div>
					)}
				</div>

				<div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-80 overflow-y-auto min-h-[200px]'>
					{isLoading ? (
						<div className='h-full flex flex-col items-center justify-center p-6 text-gray-500'>
							<Loader2 className='w-8 h-8 animate-spin text-blue-500 mb-2' />
							<span>Loading folders...</span>
						</div>
					) : results.length === 0 ? (
						<div className='h-full flex flex-col items-center justify-center p-6 text-gray-500'>
							<FolderOpen className='w-12 h-12 text-gray-300 mb-2' />
							<p>
								{searchQuery ? 'No folders found.' : 'No folders available.'}
							</p>
							{defaultPath && (
								<button
									onClick={handleUseDefault}
									className='mt-4 text-blue-600 hover:underline text-sm'
								>
									Use Default: {defaultPath}
								</button>
							)}
						</div>
					) : (
						<ul className='divide-y divide-gray-200 dark:divide-gray-700'>
							{results.map(result => (
								<li
									key={`${result.id || result.path}`}
									className='p-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between group transition-colors'
								>
									<div
										className='flex items-center gap-3 overflow-hidden flex-1 cursor-pointer'
										onClick={() => handleNavigate(result.id || result.path)}
									>
										<Folder className='w-5 h-5 text-gray-400 flex-shrink-0 fill-current text-blue-100 dark:text-gray-600' />
										<div className='min-w-0 text-left'>
											<p className='text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400'>
												{result.name ||
													result.display_path?.split('/').pop() ||
													result.path.split('/').pop()}
											</p>
											<p className='text-xs text-gray-500 truncate'>
												{result.display_path || result.path}
											</p>
										</div>
									</div>

									<div className='flex items-center gap-2 pl-2'>
										{(result.source === 'shared' ||
											result.drive_type === 'shared_with_me') && (
											<span className='px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full hidden sm:inline-block'>
												Shared
											</span>
										)}
										<button
											onClick={() => handleSelect(result)}
											className='px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
										>
											Select
										</button>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>

				<div className='flex justify-between pt-2 items-center'>
					<div className='text-xs text-gray-500'>
						{defaultPath && defaultPath !== currentPath && (
							<button
								onClick={handleUseDefault}
								className='hover:text-blue-600 underline'
							>
								Use Default ({defaultPath})
							</button>
						)}
					</div>
					<div className='flex gap-3'>
						<button
							onClick={onCancel}
							className='px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
						>
							Cancel
						</button>
						<button
							onClick={() =>
								handleSelect({
									id: currentPath || searchQuery,
									path: currentPath || searchQuery,
									name: (currentPath || searchQuery).split('/').pop(),
								})
							}
							className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
							disabled={!currentPath && !searchQuery}
						>
							Use Current Path
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default GoogleDriveFolderPicker;
