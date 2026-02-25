import React, { useEffect, useMemo, useState } from 'react';
import { Link } from '@/router/compat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	FolderKanban,
	Plus,
	Search,
	LayoutGrid,
	List,
	Activity,
	Github,
	Cloud,
	Globe,
	AlertTriangle,
	Eye,
	Play,
	Pause,
	RefreshCw,
	Server,
	Monitor,
	Trash2,
	Tag,
	Download,
	Upload,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import SummaryCard from '@/components/ui/SummaryCard';
import { dashboardApi } from '@/services/api';
import { queryKeys } from '@/services/queryKeys';
import {
	createLocalProjectColumns,
	createRemoteProjectColumns,
} from './projects/columns';
import { LocalProjectCard, RemoteProjectCard } from './projects/cards';
import { CLIGuideSection } from './projects/cli-guide';
import { ProjectTagModal } from './projects/tag-modal';
import type { LocalProject, RemoteProject, TagOption } from './projects/types';
import toast from 'react-hot-toast';

// Tab type
type ProjectTab = 'local' | 'remote';

const Projects: React.FC = () => {
	const queryClient = useQueryClient();
	const [searchQuery, setSearchQuery] = useState('');
	const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const [activeTab, setActiveTab] = useState<ProjectTab>('remote');
	const [showTagModal, setShowTagModal] = useState(false);
	const [activeTagProject, setActiveTagProject] =
		useState<RemoteProject | null>(null);
	const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

	// Fetch local projects
	const {
		data: localData,
		isLoading: localLoading,
		error: localError,
	} = useQuery({
		queryKey: queryKeys.projects.local(),
		queryFn: dashboardApi.getLocalProjects,
		enabled: activeTab === 'local',
	});

	// Fetch remote projects
	const {
		data: remoteData,
		isLoading: remoteLoading,
		error: remoteError,
	} = useQuery({
		queryKey: queryKeys.projects.remote(),
		queryFn: dashboardApi.getRemoteProjects,
		enabled: activeTab === 'remote',
	});

	const { data: tagsData } = useQuery({
		queryKey: queryKeys.tags.all,
		queryFn: () => dashboardApi.getTags(),
		enabled: activeTab === 'remote',
	});

	const tagOptions: TagOption[] = tagsData?.data || [];

	const { data: projectTagsData, isLoading: projectTagsLoading } = useQuery({
		queryKey: queryKeys.tags.project(activeTagProject?.id),
		queryFn: () => dashboardApi.getProjectTags(activeTagProject?.id || 0),
		enabled: showTagModal && !!activeTagProject,
	});

	useEffect(() => {
		if (projectTagsData?.data && Array.isArray(projectTagsData.data)) {
			setSelectedTagIds(projectTagsData.data.map((tag: TagOption) => tag.id));
		} else if (!showTagModal) {
			setSelectedTagIds([]);
		}
	}, [projectTagsData, showTagModal]);

	// Delete mutation
	const deleteMutation = useMutation({
		mutationFn: dashboardApi.deleteProject,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.projects.remote() });
			toast.success('Project deleted successfully');
		},
		onError: () => {
			toast.error('Failed to delete project');
		},
	});

	const setProjectTagsMutation = useMutation({
		mutationFn: ({
			projectId,
			tagIds,
		}: {
			projectId: number;
			tagIds: number[];
		}) => dashboardApi.setProjectTags(projectId, tagIds),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.projects.remote() });
			queryClient.invalidateQueries({ queryKey: queryKeys.tags.all });
			queryClient.invalidateQueries({
				queryKey: queryKeys.tags.project(activeTagProject?.id),
			});
			toast.success('Tags updated');
			setShowTagModal(false);
			setActiveTagProject(null);
		},
		onError: () => toast.error('Failed to update tags'),
	});

	const localProjects = (localData?.data || []) as LocalProject[];
	const remoteProjects = (remoteData?.data || []) as RemoteProject[];

	// Filter functions
	const filteredLocalProjects = localProjects.filter(project => {
		const matchesSearch = project.project_name
			.toLowerCase()
			.includes(searchQuery.toLowerCase());
		const matchesStatus =
			statusFilter === 'all' ||
			(statusFilter === 'running' && project.ddev_status === 'running') ||
			(statusFilter === 'stopped' && project.ddev_status !== 'running');
		return matchesSearch && matchesStatus;
	});

	const filteredRemoteProjects = remoteProjects.filter(project => {
		const matchesSearch =
			project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			project.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
			project.server_name?.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesStatus =
			statusFilter === 'all' || project.status === statusFilter;
		return matchesSearch && matchesStatus;
	});

	const executeProjectAction = async (projectName: string, action: string) => {
		try {
			await dashboardApi.executeProjectAction(projectName, action);
			queryClient.invalidateQueries({ queryKey: queryKeys.projects.local() });
			toast.success(`Action ${action} executed`);
		} catch (error) {
			toast.error('Failed to execute action');
		}
	};

	const handleDeleteProject = (projectId: number, projectName: string) => {
		if (
			window.confirm(
				`Are you sure you want to delete "${projectName}"? This cannot be undone.`,
			)
		) {
			deleteMutation.mutate(projectId);
		}
	};

	const openTagModal = (project: RemoteProject) => {
		setActiveTagProject(project);
		setShowTagModal(true);
	};

	const toggleTag = (tagId: number) => {
		setSelectedTagIds(prev =>
			prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId],
		);
	};

	const applyProjectTags = () => {
		if (!activeTagProject) return;
		setProjectTagsMutation.mutate({
			projectId: activeTagProject.id,
			tagIds: selectedTagIds,
		});
	};

	const tagColorMap = useMemo(() => {
		return new Map(tagOptions.map(tag => [tag.name, tag.color]));
	}, [tagOptions]);

	const getStatusColor = (status: string) => {
		switch (status) {
			case 'active':
				return 'success';
			case 'running':
				return 'success';
			case 'inactive':
				return 'warning';
			case 'stopped':
				return 'warning';
			case 'error':
				return 'danger';
			default:
				return 'default';
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

	const localProjectColumns = useMemo(
		() =>
			createLocalProjectColumns({
				getStatusColor,
				onAction: executeProjectAction,
			}),
		[getStatusColor],
	);

	const remoteProjectColumns = useMemo(
		() =>
			createRemoteProjectColumns({
				getStatusColor,
				getEnvironmentColor,
				tagColorMap,
				onOpenTagModal: openTagModal,
				onDeleteProject: handleDeleteProject,
			}),
		[getStatusColor, getEnvironmentColor, tagColorMap],
	);

	const isLoading = activeTab === 'local' ? localLoading : remoteLoading;
	const error = activeTab === 'local' ? localError : remoteError;

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600'></div>
			</div>
		);
	}

	if (error) {
		return (
			<div className='text-center py-12'>
				<AlertTriangle className='w-12 h-12 mx-auto mb-3 text-red-500' />
				<h3 className='text-lg font-medium text-gray-900 dark:text-white'>
					Error Loading Projects
				</h3>
				<p className='mt-2 text-gray-500 dark:text-gray-400'>
					Failed to load projects. Please try again.
				</p>
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
						Projects
					</h1>
					<p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
						Manage your WordPress projects
					</p>
				</div>
				{activeTab === 'remote' && (
					<Link to='/projects/new'>
						<Button variant='primary'>
							<Plus className='w-4 h-4 mr-2' />
							New Project
						</Button>
					</Link>
				)}
			</div>

			{/* Tabs */}
			<div className='border-b border-gray-200 dark:border-gray-700'>
				<nav className='-mb-px flex space-x-8'>
					<button
						onClick={() => setActiveTab('remote')}
						className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
							activeTab === 'remote'
								? 'border-primary-500 text-primary-600 dark:text-primary-400'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
						}`}
					>
						<Server className='w-4 h-4 mr-2' />
						Remote Projects
						<Badge variant='default' className='ml-2'>
							{remoteProjects.length}
						</Badge>
					</button>
					<button
						onClick={() => setActiveTab('local')}
						className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
							activeTab === 'local'
								? 'border-primary-500 text-primary-600 dark:text-primary-400'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
						}`}
					>
						<Monitor className='w-4 h-4 mr-2' />
						Local (DDEV)
						<Badge variant='default' className='ml-2'>
							{localProjects.length}
						</Badge>
					</button>
				</nav>
			</div>

			{/* Stats Cards */}
			{activeTab === 'remote' && (
				<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
					<SummaryCard
						title='Active'
						value={remoteProjects.filter(p => p.status === 'active').length}
						icon={Activity}
						iconClassName='w-5 h-5 text-green-600'
						iconContainerClassName='p-2 bg-green-100 rounded-lg'
						valueClassName='text-lg font-semibold text-gray-900 dark:text-white'
					/>
					<SummaryCard
						title='Staging'
						value={
							remoteProjects.filter(p => p.environment === 'staging').length
						}
						icon={Pause}
						iconClassName='w-5 h-5 text-yellow-600'
						iconContainerClassName='p-2 bg-yellow-100 rounded-lg'
						valueClassName='text-lg font-semibold text-gray-900 dark:text-white'
					/>
					<SummaryCard
						title='Production'
						value={
							remoteProjects.filter(p => p.environment === 'production').length
						}
						icon={AlertTriangle}
						iconClassName='w-5 h-5 text-red-600'
						iconContainerClassName='p-2 bg-red-100 rounded-lg'
						valueClassName='text-lg font-semibold text-gray-900 dark:text-white'
					/>
					<SummaryCard
						title='Total'
						value={remoteProjects.length}
						icon={Server}
						iconClassName='w-5 h-5 text-blue-600'
						iconContainerClassName='p-2 bg-blue-100 rounded-lg'
						valueClassName='text-lg font-semibold text-gray-900 dark:text-white'
					/>
				</div>
			)}

			{/* Filters and Search */}
			<Card>
				<div className='flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0'>
					{/* Search */}
					<div className='flex-1 max-w-lg'>
						<div className='relative'>
							<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4' />
							<input
								type='text'
								placeholder={
									activeTab === 'local'
										? 'Search local projects...'
										: 'Search by name, domain, or server...'
								}
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
								className='w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500'
							/>
						</div>
					</div>

					{/* Filters */}
					<div className='flex items-center space-x-3'>
						<select
							value={statusFilter}
							onChange={e => setStatusFilter(e.target.value)}
							className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
						>
							<option value='all'>All Status</option>
							{activeTab === 'local' ? (
								<>
									<option value='running'>Running</option>
									<option value='stopped'>Stopped</option>
								</>
							) : (
								<>
									<option value='active'>Active</option>
									<option value='paused'>Paused</option>
									<option value='archived'>Archived</option>
								</>
							)}
						</select>

						<div className='flex items-center border border-gray-300 dark:border-gray-600 rounded-lg'>
							<button
								onClick={() => setViewMode('grid')}
								className={`p-2 ${
									viewMode === 'grid'
										? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
										: 'text-gray-500 dark:text-gray-400'
								}`}
							>
								<LayoutGrid className='w-4 h-4' />
							</button>
							<button
								onClick={() => setViewMode('list')}
								className={`p-2 ${
									viewMode === 'list'
										? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
										: 'text-gray-500 dark:text-gray-400'
								}`}
							>
								<List className='w-4 h-4' />
							</button>
						</div>
					</div>
				</div>
			</Card>

			{/* Projects Display */}
			{activeTab === 'local' ? (
				/* LOCAL PROJECTS TAB */
				<>
					{/* CLI Guide - Always show on Local tab */}
					<CLIGuideSection hasProjects={localProjects.length > 0} />

					{filteredLocalProjects.length === 0 ? (
						<Card>
							<div className='text-center py-12'>
								<Monitor className='w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600' />
								<h3 className='text-lg font-medium text-gray-900 dark:text-white'>
									No Local Projects Found
								</h3>
								<p className='mt-2 text-gray-500 dark:text-gray-400'>
									{searchQuery || statusFilter !== 'all'
										? 'Try adjusting your search or filters.'
										: 'Use the CLI commands above to create your first local project.'}
								</p>
							</div>
						</Card>
					) : viewMode === 'grid' ? (
						<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
							{filteredLocalProjects.map(project => (
								<LocalProjectCard
									key={project.project_name}
									project={project}
									getStatusColor={getStatusColor}
									onAction={executeProjectAction}
								/>
							))}
						</div>
					) : (
						<Card>
							<DataTable
								columns={localProjectColumns}
								data={filteredLocalProjects}
								showFilter={false}
								filterValue=''
								onFilterChange={() => {}}
								filterPlaceholder=''
								emptyMessage='No local projects found.'
								initialPageSize={10}
							/>
						</Card>
					)}
				</>
			) : /* REMOTE PROJECTS TAB */
			filteredRemoteProjects.length === 0 ? (
				<Card>
					<div className='text-center py-12'>
						<FolderKanban className='w-12 h-12 mx-auto mb-3 text-gray-300' />
						<h3 className='text-lg font-medium text-gray-900'>
							No Remote Projects Found
						</h3>
						<p className='mt-2 text-gray-500'>
							{searchQuery || statusFilter !== 'all'
								? 'Try adjusting your search or filters.'
								: 'Get started by creating your first server-deployed project.'}
						</p>
						<Link to='/projects/new' className='mt-4 inline-block'>
							<Button variant='primary'>
								<Plus className='w-4 h-4 mr-2' />
								Create Project
							</Button>
						</Link>
					</div>
				</Card>
			) : viewMode === 'grid' ? (
				<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
					{filteredRemoteProjects.map(project => (
						<RemoteProjectCard
							key={project.id}
							project={project}
							getStatusColor={getStatusColor}
							getEnvironmentColor={getEnvironmentColor}
							tagColorMap={tagColorMap}
							onOpenTagModal={openTagModal}
							onDeleteProject={handleDeleteProject}
						/>
					))}
				</div>
			) : (
				<Card>
					<DataTable
						columns={remoteProjectColumns}
						data={filteredRemoteProjects}
						showFilter={false}
						filterValue=''
						onFilterChange={() => {}}
						filterPlaceholder=''
						emptyMessage='No remote projects found.'
						initialPageSize={10}
					/>
				</Card>
			)}

			<ProjectTagModal
				open={showTagModal}
				project={activeTagProject}
				tagOptions={tagOptions}
				selectedTagIds={selectedTagIds}
				isLoading={projectTagsLoading}
				isSaving={setProjectTagsMutation.isLoading}
				onClose={() => {
					setShowTagModal(false);
					setActiveTagProject(null);
				}}
				onToggleTag={toggleTag}
				onSave={applyProjectTags}
			/>
		</div>
	);
};

export default Projects;
