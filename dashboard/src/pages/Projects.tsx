import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
	Terminal,
	Copy,
	Check,
	ChevronDown,
	ChevronRight,
	BookOpen,
	Database,
	Download,
	Upload,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import SummaryCard from '@/components/ui/SummaryCard';
import { dashboardApi } from '@/services/api';
import toast from 'react-hot-toast';

// CLI Command Component
const CLICommand: React.FC<{ command: string; description: string }> = ({
	command,
	description,
}) => {
	const [copied, setCopied] = useState(false);

	const copyToClipboard = () => {
		navigator.clipboard.writeText(command);
		setCopied(true);
		toast.success('Command copied!');
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className='flex items-center justify-between p-3 bg-gray-900 rounded-lg group'>
			<div className='flex-1'>
				<code className='text-green-400 text-sm font-mono'>{command}</code>
				<p className='text-gray-400 text-xs mt-1'>{description}</p>
			</div>
			<button
				onClick={copyToClipboard}
				className='ml-3 p-2 text-gray-400 hover:text-white transition-colors'
				title='Copy command'
			>
				{copied ? (
					<Check className='w-4 h-4 text-green-400' />
				) : (
					<Copy className='w-4 h-4' />
				)}
			</button>
		</div>
	);
};

// CLI Guide Section
const CLIGuideSection: React.FC<{ hasProjects: boolean }> = ({
	hasProjects,
}) => {
	const [isExpanded, setIsExpanded] = useState(!hasProjects);

	return (
		<Card className='bg-gradient-to-r from-gray-800 to-gray-900 text-white mb-6'>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className='w-full flex items-center justify-between'
			>
				<div className='flex items-center'>
					<Terminal className='w-5 h-5 mr-3 text-green-400' />
					<div className='text-left'>
						<h3 className='font-semibold'>Local Development Commands</h3>
						<p className='text-sm text-gray-400'>
							Manage local projects via CLI
						</p>
					</div>
				</div>
				{isExpanded ? (
					<ChevronDown className='w-5 h-5 text-gray-400' />
				) : (
					<ChevronRight className='w-5 h-5 text-gray-400' />
				)}
			</button>

			{isExpanded && (
				<div className='mt-6 space-y-6'>
					{/* Getting Started */}
					<div>
						<h4 className='text-sm font-medium text-gray-300 mb-3 flex items-center'>
							<BookOpen className='w-4 h-4 mr-2' />
							Getting Started
						</h4>
						<div className='space-y-2'>
							<CLICommand
								command='forge new my-site'
								description='Create a new WordPress project with DDEV'
							/>
							<CLICommand
								command='forge list'
								description='List all local projects'
							/>
						</div>
					</div>

					{/* DDEV Control */}
					<div>
						<h4 className='text-sm font-medium text-gray-300 mb-3 flex items-center'>
							<Play className='w-4 h-4 mr-2' />
							DDEV Control
						</h4>
						<div className='space-y-2'>
							<CLICommand
								command='ddev start'
								description='Start DDEV environment (run in project folder)'
							/>
							<CLICommand
								command='ddev stop'
								description='Stop DDEV environment'
							/>
							<CLICommand
								command='ddev restart'
								description='Restart DDEV environment'
							/>
						</div>
					</div>

					{/* WordPress CLI */}
					<div>
						<h4 className='text-sm font-medium text-gray-300 mb-3 flex items-center'>
							<Terminal className='w-4 h-4 mr-2' />
							WordPress CLI
						</h4>
						<div className='space-y-2'>
							<CLICommand
								command='ddev wp plugin list'
								description='List installed plugins'
							/>
							<CLICommand
								command='ddev wp theme list'
								description='List installed themes'
							/>
							<CLICommand
								command='ddev ssh'
								description='SSH into the container'
							/>
						</div>
					</div>

					{/* Database */}
					<div>
						<h4 className='text-sm font-medium text-gray-300 mb-3 flex items-center'>
							<Database className='w-4 h-4 mr-2' />
							Database Operations
						</h4>
						<div className='space-y-2'>
							<CLICommand
								command='ddev export-db > backup.sql.gz'
								description='Export database to file'
							/>
							<CLICommand
								command='ddev import-db --file=backup.sql.gz'
								description='Import database from file'
							/>
						</div>
					</div>

					{/* Info box */}
					<div className='p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg'>
						<p className='text-sm text-blue-200'>
							<strong>Note:</strong> Local projects are managed on your
							development machine. This dashboard displays projects found in{' '}
							<code className='bg-blue-900/50 px-1 rounded'>
								~/.forge/projects.json
							</code>
						</p>
					</div>
				</div>
			)}
		</Card>
	);
};

// Types
interface LocalProject {
	project_name: string;
	directory: string;
	wp_home: string;
	repo_url: string | null;
	created_date: string | null;
	ddev_status: string;
}

interface RemoteProject {
	id: number;
	name: string;
	slug: string;
	domain: string;
	environment: string;
	status: string;
	server_name: string | null;
	health_score: number;
	tags: string[];
	created_at: string;
}

interface TagOption {
	id: number;
	name: string;
	color: string;
}

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
		queryKey: ['local-projects'],
		queryFn: dashboardApi.getLocalProjects,
		enabled: activeTab === 'local',
	});

	// Fetch remote projects
	const {
		data: remoteData,
		isLoading: remoteLoading,
		error: remoteError,
	} = useQuery({
		queryKey: ['remote-projects'],
		queryFn: dashboardApi.getRemoteProjects,
		enabled: activeTab === 'remote',
	});

	const { data: tagsData } = useQuery({
		queryKey: ['tags'],
		queryFn: () => dashboardApi.getTags(),
		enabled: activeTab === 'remote',
	});

	const tagOptions: TagOption[] = tagsData?.data || [];

	const { data: projectTagsData, isLoading: projectTagsLoading } = useQuery({
		queryKey: ['project-tags', activeTagProject?.id],
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
			queryClient.invalidateQueries({ queryKey: ['remote-projects'] });
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
			queryClient.invalidateQueries({ queryKey: ['remote-projects'] });
			queryClient.invalidateQueries({
				queryKey: ['project-tags', activeTagProject?.id],
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
			queryClient.invalidateQueries({ queryKey: ['local-projects'] });
			toast.success(`Action ${action} executed`);
		} catch (error) {
			toast.error('Failed to execute action');
		}
	};

	const handleDeleteProject = (projectId: number, projectName: string) => {
		if (
			window.confirm(
				`Are you sure you want to delete "${projectName}"? This cannot be undone.`
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
			prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
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
								<Card
									key={project.project_name}
									className='hover:shadow-md transition-shadow'
								>
									<div className='space-y-4'>
										<div className='flex items-start justify-between'>
											<div>
												<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
													{project.project_name}
												</h3>
												<p className='text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]'>
													{project.directory}
												</p>
											</div>
											<Badge variant={getStatusColor(project.ddev_status)}>
												{project.ddev_status}
											</Badge>
										</div>

										<div className='text-sm'>
											<a
												href={project.wp_home}
												target='_blank'
												rel='noopener noreferrer'
												className='text-primary-600 dark:text-primary-400 hover:underline'
											>
												{project.wp_home}
											</a>
										</div>

										<div className='flex items-center justify-between pt-4 border-t dark:border-gray-700'>
											<div className='text-xs text-gray-500 dark:text-gray-400'>
												{project.created_date &&
													`Created: ${project.created_date}`}
											</div>
											<div className='flex items-center space-x-2'>
												{project.ddev_status !== 'running' ? (
													<Button
														variant='secondary'
														size='sm'
														onClick={() =>
															executeProjectAction(
																project.project_name,
																'start_ddev'
															)
														}
													>
														<Play className='w-4 h-4' />
													</Button>
												) : (
													<Button
														variant='secondary'
														size='sm'
														onClick={() =>
															executeProjectAction(
																project.project_name,
																'stop_ddev'
															)
														}
													>
														<Pause className='w-4 h-4' />
													</Button>
												)}
												<Button
													variant='secondary'
													size='sm'
													onClick={() =>
														executeProjectAction(
															project.project_name,
															'restart_ddev'
														)
													}
												>
													<RefreshCw className='w-4 h-4' />
												</Button>
											</div>
										</div>
									</div>
								</Card>
							))}
						</div>
					) : (
						<Card>
							<div className='overflow-x-auto'>
								<table className='min-w-full divide-y divide-gray-200'>
									<thead className='bg-gray-50'>
										<tr>
											<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
												Project
											</th>
											<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
												Directory
											</th>
											<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
												Status
											</th>
											<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
												Actions
											</th>
										</tr>
									</thead>
									<tbody className='bg-white divide-y divide-gray-200'>
										{filteredLocalProjects.map(project => (
											<tr
												key={project.project_name}
												className='hover:bg-gray-50'
											>
												<td className='px-6 py-4 whitespace-nowrap'>
													<div className='text-sm font-medium text-gray-900'>
														{project.project_name}
													</div>
													<a
														href={project.wp_home}
														target='_blank'
														rel='noopener noreferrer'
														className='text-xs text-primary-600 hover:underline'
													>
														{project.wp_home}
													</a>
												</td>
												<td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate'>
													{project.directory}
												</td>
												<td className='px-6 py-4 whitespace-nowrap'>
													<Badge variant={getStatusColor(project.ddev_status)}>
														{project.ddev_status}
													</Badge>
												</td>
												<td className='px-6 py-4 whitespace-nowrap'>
													<div className='flex items-center space-x-2'>
														{project.ddev_status !== 'running' ? (
															<Button
																variant='secondary'
																size='sm'
																onClick={() =>
																	executeProjectAction(
																		project.project_name,
																		'start_ddev'
																	)
																}
															>
																<Play className='w-4 h-4' />
															</Button>
														) : (
															<Button
																variant='secondary'
																size='sm'
																onClick={() =>
																	executeProjectAction(
																		project.project_name,
																		'stop_ddev'
																	)
																}
															>
																<Pause className='w-4 h-4' />
															</Button>
														)}
													</div>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
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
						<Card
							key={project.id}
							className='hover:shadow-md transition-shadow'
						>
							<div className='space-y-4'>
								<div className='flex items-start justify-between'>
									<div>
										<h3 className='text-lg font-semibold text-gray-900'>
											{project.name}
										</h3>
										<p className='text-sm text-gray-500'>
											{project.server_name || 'No Server'}
										</p>
									</div>
									<div className='flex flex-col items-end space-y-1'>
										<Badge variant={getStatusColor(project.status)}>
											{project.status}
										</Badge>
										<Badge variant={getEnvironmentColor(project.environment)}>
											{project.environment}
										</Badge>
									</div>
								</div>

								<div className='text-sm'>
									<a
										href={`https://${project.domain}`}
										target='_blank'
										rel='noopener noreferrer'
										className='text-primary-600 hover:underline'
									>
										{project.domain}
									</a>
								</div>

								{project.tags && project.tags.length > 0 && (
									<div className='space-y-1'>
										<div className='flex items-center justify-between text-xs text-gray-500'>
											<span className='font-medium'>Tags</span>
											<button
												onClick={() => openTagModal(project)}
												className='text-primary-600 hover:text-primary-700'
												type='button'
											>
												Manage
											</button>
										</div>
										<div className='flex flex-wrap gap-1'>
											{project.tags.slice(0, 3).map(tag => (
												<span
													key={tag}
													className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border'
													style={{
														borderColor: tagColorMap.get(tag) || '#e5e7eb',
														color: tagColorMap.get(tag) || '#374151',
													}}
												>
													<Tag className='w-3 h-3 mr-1' />
													{tag}
												</span>
											))}
											{project.tags.length > 3 && (
												<span className='text-xs text-gray-500'>
													+{project.tags.length - 3} more
												</span>
											)}
										</div>
									</div>
								)}

								<div className='flex items-center justify-between pt-4 border-t'>
									<div className='flex items-center flex-wrap gap-2'>
										<Link to={`/projects/${project.slug}`}>
											<Button variant='ghost' size='sm'>
												<Eye className='w-4 h-4 mr-1' />
												View
											</Button>
										</Link>
										<a
											href={`https://${project.domain}`}
											target='_blank'
											rel='noopener noreferrer'
										>
											<Button variant='ghost' size='sm'>
												<Globe className='w-4 h-4 mr-1' />
												Open
											</Button>
										</a>
										<Link to={`/backups?project_id=${project.id}`}>
											<Button variant='ghost' size='sm'>
												<Download className='w-4 h-4 mr-1' />
												Backups
											</Button>
										</Link>
										<Link to={`/migrations?project_id=${project.id}`}>
											<Button variant='ghost' size='sm'>
												<Upload className='w-4 h-4 mr-1' />
												Migrations
											</Button>
										</Link>
									</div>
									<div className='flex items-center space-x-2'>
										<Button
											variant='ghost'
											size='sm'
											onClick={() => openTagModal(project)}
											title='Manage tags'
										>
											<Tag className='w-4 h-4' />
										</Button>
										<Button
											variant='ghost'
											size='sm'
											onClick={() =>
												handleDeleteProject(project.id, project.name)
											}
											className='text-red-600 hover:text-red-700 hover:bg-red-50'
										>
											<Trash2 className='w-4 h-4' />
										</Button>
									</div>
								</div>
							</div>
						</Card>
					))}
				</div>
			) : (
				<Card>
					<div className='overflow-x-auto'>
						<table className='min-w-full divide-y divide-gray-200'>
							<thead className='bg-gray-50'>
								<tr>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
										Project
									</th>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
										Server
									</th>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
										Environment
									</th>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
										Status
									</th>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
										Tags
									</th>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
										Actions
									</th>
								</tr>
							</thead>
							<tbody className='bg-white divide-y divide-gray-200'>
								{filteredRemoteProjects.map(project => (
									<tr key={project.id} className='hover:bg-gray-50'>
										<td className='px-6 py-4 whitespace-nowrap'>
											<div className='text-sm font-medium text-gray-900'>
												{project.name}
											</div>
											<div className='text-xs text-gray-500'>
												{project.domain}
											</div>
										</td>
										<td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
											{project.server_name || 'N/A'}
										</td>
										<td className='px-6 py-4 whitespace-nowrap'>
											<Badge variant={getEnvironmentColor(project.environment)}>
												{project.environment}
											</Badge>
										</td>
										<td className='px-6 py-4 whitespace-nowrap'>
											<Badge variant={getStatusColor(project.status)}>
												{project.status}
											</Badge>
										</td>
										<td className='px-6 py-4 whitespace-nowrap'>
											{project.tags && project.tags.length > 0 ? (
												<div className='flex flex-wrap gap-1'>
													{project.tags.slice(0, 2).map(tag => (
														<span
															key={tag}
															className='text-xs px-1.5 py-0.5 rounded border'
															style={{
																borderColor: tagColorMap.get(tag) || '#e5e7eb',
																color: tagColorMap.get(tag) || '#374151',
															}}
														>
															{tag}
														</span>
													))}
													{project.tags.length > 2 && (
														<span className='text-xs text-gray-500'>
															+{project.tags.length - 2} more
														</span>
													)}
												</div>
											) : (
												<span className='text-xs text-gray-400'>No tags</span>
											)}
										</td>
										<td className='px-6 py-4 whitespace-nowrap'>
											<div className='flex items-center space-x-2'>
												<Link to={`/projects/${project.slug}`}>
													<Button variant='ghost' size='sm'>
														<Eye className='w-4 h-4' />
													</Button>
												</Link>
												<Link to={`/backups?project_id=${project.id}`}>
													<Button variant='ghost' size='sm' title='Backups'>
														<Download className='w-4 h-4' />
													</Button>
												</Link>
												<Link to={`/migrations?project_id=${project.id}`}>
													<Button variant='ghost' size='sm' title='Migrations'>
														<Upload className='w-4 h-4' />
													</Button>
												</Link>
												<Button
													variant='ghost'
													size='sm'
													onClick={() => openTagModal(project)}
													title='Manage tags'
												>
													<Tag className='w-4 h-4' />
												</Button>
												<Button
													variant='ghost'
													size='sm'
													onClick={() =>
														handleDeleteProject(project.id, project.name)
													}
													className='text-red-600'
												>
													<Trash2 className='w-4 h-4' />
												</Button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Card>
			)}

			{showTagModal && activeTagProject && (
				<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-lg p-6 max-w-lg w-full mx-4'>
						<div className='flex items-center justify-between mb-4'>
							<h3 className='text-lg font-medium text-gray-900'>
								Project Tags
							</h3>
							<Button
								variant='ghost'
								size='sm'
								onClick={() => {
									setShowTagModal(false);
									setActiveTagProject(null);
								}}
							>
								✕
							</Button>
						</div>

						<p className='text-sm text-gray-500 mb-4'>
							{activeTagProject.name} • {activeTagProject.domain}
						</p>

						{projectTagsLoading ? (
							<div className='text-sm text-gray-500'>Loading tags...</div>
						) : (
							<div className='flex flex-wrap gap-2'>
								{tagOptions.length === 0 && (
									<span className='text-sm text-gray-500'>
										No tags available
									</span>
								)}
								{tagOptions.map(tag => (
									<button
										key={tag.id}
										type='button'
										onClick={() => toggleTag(tag.id)}
										className={`inline-flex items-center px-3 py-1 rounded-full text-sm border transition ${
											selectedTagIds.includes(tag.id)
												? 'border-transparent text-white'
												: 'border-gray-300 text-gray-700'
										}`}
										style={{
											backgroundColor: selectedTagIds.includes(tag.id)
												? tag.color
												: 'transparent',
										}}
									>
										{tag.name}
									</button>
								))}
							</div>
						)}

						<div className='flex justify-end space-x-3 mt-6'>
							<Button
								variant='secondary'
								onClick={() => {
									setShowTagModal(false);
									setActiveTagProject(null);
								}}
							>
								Cancel
							</Button>
							<Button
								variant='primary'
								onClick={applyProjectTags}
								disabled={setProjectTagsMutation.isLoading}
							>
								{setProjectTagsMutation.isLoading ? 'Saving...' : 'Save Tags'}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Projects;
