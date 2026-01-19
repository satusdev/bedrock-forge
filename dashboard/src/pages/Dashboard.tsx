import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
	FolderKanban,
	Activity,
	Users,
	Github,
	AlertTriangle,
	CheckCircle,
	Cloud,
	Wifi,
	WifiOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { dashboardApi } from '@/services/api';
import { useDashboardStore } from '@/store/useDashboardStore';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import RevenueChart from '@/components/dashboard/RevenueChart';
import RenewalCalendar from '@/components/dashboard/RenewalCalendar';

const Dashboard: React.FC = () => {
	const {
		setStats,
		setProjects,
		setGitHubAuthenticated,
		setGoogleDriveAuthenticated,
	} = useDashboardStore();

	// Modal states
	const [showGitHubModal, setShowGitHubModal] = useState(false);
	const [showGDriveModal, setShowGDriveModal] = useState(false);
	const [gitHubToken, setGitHubToken] = useState('');
	const [isConfiguring, setIsConfiguring] = useState(false);
	const [gdriveAuthUrl, setGdriveAuthUrl] = useState('');

	// Set up real-time updates
	const { isConnected, subscribeToProject, unsubscribeFromProject } =
		useRealTimeUpdates({
			onDdevStatusChange: (projectName, status, message) => {
				// DDEV status changes are handled automatically via query invalidation
				console.log(`DDEV status changed for ${projectName}: ${status}`);
			},
			onConnectionChange: connected => {
				console.log('Real-time updates connection changed:', connected);
			},
		});

	// Fetch dashboard stats
	const { data: stats, isLoading: statsLoading } = useQuery({
		queryKey: ['dashboard-stats'],
		queryFn: dashboardApi.getStats,
		onSuccess: (response: any) => {
			setStats(response.data);
		},
	});

	// Fetch projects
	const { data: projects, isLoading: projectsLoading } = useQuery({
		queryKey: ['comprehensive-projects'],
		queryFn: dashboardApi.getComprehensiveProjects,
		onSuccess: (response: any) => {
			setProjects(response.data);
		},
	});

	// Check GitHub auth status
	useQuery({
		queryKey: ['github-auth-status'],
		queryFn: dashboardApi.getGitHubAuthStatus,
		onSuccess: (response: any) => {
			setGitHubAuthenticated(response.data.authenticated);
		},
	});

	// Check Google Drive auth status
	useQuery({
		queryKey: ['google-drive-auth-status'],
		queryFn: dashboardApi.getGoogleDriveAuthStatus,
		onSuccess: (response: any) => {
			setGoogleDriveAuthenticated(response.data.authenticated);
		},
	});

	// Fetch expiring items
	const { data: expiringData } = useQuery({
		queryKey: ['expiring-items'],
		queryFn: () => dashboardApi.getExpiringItems(30),
	});
	const expiringItems = expiringData?.data;

	const statsData = stats?.data;
	const projectsData = projects?.data || [];

	// Get recent projects (last 5)
	const recentProjects = projectsData
		.sort(
			(a: any, b: any) =>
				new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
		)
		.slice(0, 5);

	// Get projects with issues
	const projectsWithIssues = projectsData.filter(
		(project: any) => project.health_score < 80 || project.status === 'error'
	);

	const statCards = [
		{
			title: 'Total Projects',
			value: statsData?.total_projects || 0,
			icon: FolderKanban,
			color: 'text-blue-600',
			bgColor: 'bg-blue-100',
		},
		{
			title: 'Active Projects',
			value: statsData?.active_projects || 0,
			icon: Activity,
			color: 'text-green-600',
			bgColor: 'bg-green-100',
		},
		{
			title: 'Total Clients',
			value: new Set(
				projectsData.map((p: any) => p.client?.name).filter(Boolean)
			).size,
			icon: Users,
			color: 'text-purple-600',
			bgColor: 'bg-purple-100',
		},
		{
			title: 'Healthy Sites',
			value: statsData?.healthy_sites || 0,
			icon: CheckCircle,
			color: 'text-emerald-600',
			bgColor: 'bg-emerald-100',
		},
	];

	// Handler for GitHub token configuration
	const handleGitHubSubmit = async () => {
		if (!gitHubToken.trim()) return;
		setIsConfiguring(true);
		try {
			await dashboardApi.authenticateGitHub(gitHubToken);
			setGitHubAuthenticated(true);
			setShowGitHubModal(false);
			setGitHubToken('');
		} catch (error) {
			console.error('GitHub config failed:', error);
		} finally {
			setIsConfiguring(false);
		}
	};

	// Handler for Google Drive OAuth
	const handleGoogleDriveAuth = async () => {
		setIsConfiguring(true);
		try {
			const response = await dashboardApi.authenticateGoogleDrive();
			const authUrl = response.data?.auth_url;
			if (authUrl) {
				setGdriveAuthUrl(authUrl);
				// Open OAuth URL in new window
				window.open(authUrl, '_blank', 'width=600,height=700');
			}
		} catch (error: any) {
			console.error('Google Drive auth failed:', error);
			const message =
				error.response?.data?.detail ||
				'Failed to start Google Drive authentication';
			toast.error(message);
		} finally {
			setIsConfiguring(false);
		}
	};

	if (statsLoading || projectsLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600'></div>
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Page Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
						Dashboard
					</h1>
					<p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
						Welcome back! Here's an overview of your WordPress projects.
					</p>
				</div>
				<div className='flex items-center space-x-3'>
					{/* Connection Status */}
					<div className='flex items-center space-x-2 px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-700'>
						{isConnected ? (
							<>
								<Wifi className='w-4 h-4 text-green-600' />
								<span className='text-sm text-green-700 dark:text-green-400'>
									Live
								</span>
							</>
						) : (
							<>
								<WifiOff className='w-4 h-4 text-red-600' />
								<span className='text-sm text-red-700 dark:text-red-400'>
									Offline
								</span>
							</>
						)}
					</div>
					<Link to='/projects'>
						<Button variant='primary'>View All Projects</Button>
					</Link>
				</div>
			</div>

			{/* Stats Grid */}
			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
				{statCards.map(stat => {
					const Icon = stat.icon;
					return (
						<Card key={stat.title}>
							<div className='flex items-center'>
								<div className={`p-3 rounded-lg ${stat.bgColor}`}>
									<Icon className={`w-6 h-6 ${stat.color}`} />
								</div>
								<div className='ml-4'>
									<p className='text-sm font-medium text-gray-500 dark:text-gray-400'>
										{stat.title}
									</p>
									<p className='text-2xl font-bold text-gray-900 dark:text-white'>
										{stat.value}
									</p>
								</div>
							</div>
						</Card>
					);
				})}
			</div>

			{/* Financial & Assets Overview */}
			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				<RevenueChart />
				<RenewalCalendar />
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				{/* Recent Projects */}
				<Card title='Recent Projects'>
					<div className='space-y-4'>
						{recentProjects.length > 0 ? (
							recentProjects.map((project: any) => (
								<div
									key={project.project_name}
									className='flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg'
								>
									<div className='flex-1'>
										<div className='flex items-center space-x-2'>
											<h4 className='text-sm font-medium text-gray-900 dark:text-white'>
												{project.project_name}
											</h4>
											<Badge
												variant={
													project.status === 'active' ? 'success' : 'warning'
												}
											>
												{project.status}
											</Badge>
										</div>
										<div className='flex items-center space-x-4 mt-1 text-xs text-gray-500 dark:text-gray-400'>
											<span>Health: {project.health_score}%</span>
											<span>Client: {project.client?.name || 'N/A'}</span>
										</div>
									</div>
									<Link to={`/projects/${project.project_name}`}>
										<Button variant='ghost' size='sm'>
											View
										</Button>
									</Link>
								</div>
							))
						) : (
							<div className='text-center py-8 text-gray-500 dark:text-gray-400'>
								<FolderKanban className='w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600' />
								<p>No projects yet</p>
								<Link to='/projects' className='mt-2 inline-block'>
									<Button size='sm'>Create Project</Button>
								</Link>
							</div>
						)}
					</div>
				</Card>

				{/* Projects with Issues */}
				<Card title='Projects Needing Attention'>
					<div className='space-y-4'>
						{projectsWithIssues.length > 0 ? (
							projectsWithIssues.map((project: any) => (
								<div
									key={project.project_name}
									className='flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg'
								>
									<div className='flex items-center space-x-3'>
										<AlertTriangle className='w-5 h-5 text-red-500' />
										<div>
											<h4 className='text-sm font-medium text-gray-900 dark:text-white'>
												{project.project_name}
											</h4>
											<p className='text-xs text-gray-500 dark:text-gray-400'>
												Health Score: {project.health_score}% • {project.status}
											</p>
										</div>
									</div>
									<Link to={`/projects/${project.project_name}`}>
										<Button variant='danger' size='sm'>
											Fix
										</Button>
									</Link>
								</div>
							))
						) : (
							<div className='text-center py-8 text-green-500 dark:text-green-400'>
								<CheckCircle className='w-12 h-12 mx-auto mb-3 text-green-300 dark:text-green-600' />
								<p>All projects are healthy!</p>
							</div>
						)}
					</div>
				</Card>
			</div>

			{/* Expiring Soon */}
			{expiringItems &&
				(expiringItems.domains?.length > 0 ||
					expiringItems.ssl_certificates?.length > 0) && (
					<Card title='⚠️ Expiring Soon'>
						<div className='space-y-3'>
							{expiringItems.domains?.map((domain: any) => (
								<div
									key={domain.id}
									className='flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg'
								>
									<div>
										<h4 className='text-sm font-medium text-gray-900 dark:text-white'>
											{domain.name}
										</h4>
										<p className='text-xs text-gray-500 dark:text-gray-400'>
											Domain expires {domain.expiry_date}
										</p>
									</div>
									<Badge variant={domain.days_left <= 7 ? 'danger' : 'warning'}>
										{domain.days_left} days
									</Badge>
								</div>
							))}
							{expiringItems.ssl_certificates?.map((cert: any) => (
								<div
									key={cert.id}
									className='flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg'
								>
									<div>
										<h4 className='text-sm font-medium text-gray-900 dark:text-white'>
											{cert.common_name}
										</h4>
										<p className='text-xs text-gray-500 dark:text-gray-400'>
											SSL expires {cert.expiry_date}
										</p>
									</div>
									<Badge variant={cert.days_left <= 7 ? 'danger' : 'warning'}>
										{cert.days_left} days
									</Badge>
								</div>
							))}
						</div>
					</Card>
				)}

			{/* Integration Status */}
			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				<Card title='GitHub Integration'>
					<div className='space-y-4'>
						<div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg'>
							<div className='flex items-center space-x-3'>
								<Github className='w-6 h-6 text-gray-700 dark:text-gray-300' />
								<div>
									<h4 className='text-sm font-medium text-gray-900 dark:text-white'>
										Repository Sync
									</h4>
									<p className='text-xs text-gray-500 dark:text-gray-400'>
										Connect your GitHub repositories
									</p>
								</div>
							</div>
							<Badge
								variant={
									stats?.data?.github_authenticated ? 'success' : 'warning'
								}
							>
								{stats?.data?.github_authenticated
									? 'Connected'
									: 'Not Connected'}
							</Badge>
						</div>
						<Button
							className='w-full'
							variant='secondary'
							onClick={() => setShowGitHubModal(true)}
						>
							Configure GitHub
						</Button>
					</div>
				</Card>

				<Card title='Google Drive Integration'>
					<div className='space-y-4'>
						<div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg'>
							<div className='flex items-center space-x-3'>
								<Cloud className='w-6 h-6 text-gray-700 dark:text-gray-300' />
								<div>
									<h4 className='text-sm font-medium text-gray-900 dark:text-white'>
										Backup Storage
									</h4>
									<p className='text-xs text-gray-500 dark:text-gray-400'>
										Automatic backups to Google Drive
									</p>
								</div>
							</div>
							<Badge
								variant={
									stats?.data?.google_drive_authenticated
										? 'success'
										: 'warning'
								}
							>
								{stats?.data?.google_drive_authenticated
									? 'Connected'
									: 'Not Connected'}
							</Badge>
						</div>
						<Button
							className='w-full'
							variant='secondary'
							onClick={() => setShowGDriveModal(true)}
						>
							Configure Google Drive
						</Button>
					</div>
				</Card>
			</div>

			{/* GitHub Configuration Modal */}
			{showGitHubModal && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
					<div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6'>
						<div className='flex items-center justify-between mb-4'>
							<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
								Configure GitHub
							</h3>
							<button
								onClick={() => setShowGitHubModal(false)}
								className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
							>
								✕
							</button>
						</div>
						<p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
							Enter your GitHub Personal Access Token to connect repositories.
						</p>
						<div className='mb-4'>
							<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
								Access Token
							</label>
							<input
								type='password'
								value={gitHubToken}
								onChange={e => setGitHubToken(e.target.value)}
								placeholder='ghp_xxxxxxxxxxxx'
								className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent'
							/>
						</div>
						<div className='flex justify-end space-x-3'>
							<Button
								variant='outline'
								onClick={() => setShowGitHubModal(false)}
							>
								Cancel
							</Button>
							<Button
								onClick={handleGitHubSubmit}
								disabled={isConfiguring || !gitHubToken.trim()}
							>
								{isConfiguring ? 'Connecting...' : 'Connect'}
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Google Drive Configuration Modal */}
			{showGDriveModal && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
					<div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6'>
						<div className='flex items-center justify-between mb-4'>
							<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
								Configure Google Drive
							</h3>
							<button
								onClick={() => setShowGDriveModal(false)}
								className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
							>
								✕
							</button>
						</div>
						<p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
							Connect your Google Drive account to enable automatic backups.
						</p>
						{gdriveAuthUrl ? (
							<div className='mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg text-sm'>
								<p>
									Authorization window opened. Complete the OAuth flow there.
								</p>
								<a
									href={gdriveAuthUrl}
									target='_blank'
									rel='noopener noreferrer'
									className='text-blue-600 dark:text-blue-400 underline mt-2 block'
								>
									Click here if the window didn't open
								</a>
							</div>
						) : (
							<p className='text-sm text-gray-500 dark:text-gray-400 mb-4'>
								You'll be redirected to Google to authorize access.
							</p>
						)}
						<div className='flex justify-end space-x-3'>
							<Button
								variant='outline'
								onClick={() => {
									setShowGDriveModal(false);
									setGdriveAuthUrl('');
								}}
							>
								Cancel
							</Button>
							<Button onClick={handleGoogleDriveAuth} disabled={isConfiguring}>
								{isConfiguring ? 'Connecting...' : 'Start Authorization'}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default Dashboard;
