import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	Globe,
	Activity,
	Clock,
	CheckCircle,
	AlertTriangle,
	RefreshCw,
	Database,
	Server,
	Shield,
	FileText,
	Calendar,
	User,
	Code,
} from 'lucide-react';
import { dashboardApi } from '@/services/api';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';

interface ProjectOverviewProps {
	project: any;
}

const ProjectOverview: React.FC<ProjectOverviewProps> = ({ project }) => {
	// Fetch additional project data
	const { data: gitStatus } = useQuery(
		['git-status', project.project_name],
		() => dashboardApi.getRepositoryStatus(project.project_name),
		{
			enabled: !!project.project_name,
		},
	);

	const { data: plugins, isLoading: pluginsLoading } = useQuery(
		['plugins', project.project_name || project.name || project.slug],
		() =>
			dashboardApi.getProjectPlugins(
				project.project_name || project.name || project.slug,
			),
		{
			enabled: !!(project.project_name || project.name || project.slug),
			staleTime: 60000,
		},
	);

	const { data: themes, isLoading: themesLoading } = useQuery(
		['themes', project.project_name || project.name || project.slug],
		() =>
			dashboardApi.getProjectThemes(
				project.project_name || project.name || project.slug,
			),
		{
			enabled: !!(project.project_name || project.name || project.slug),
			staleTime: 60000,
		},
	);

	const getEnvironmentStatus = (envType: string) => {
		const env = project.environments[envType];
		if (!env) return null;

		const isHealthy = env.health_score >= 80;

		return {
			...env,
			isHealthy,
			statusIcon: isHealthy ? (
				<CheckCircle className='w-4 h-4 text-green-500' />
			) : (
				<Clock className='w-4 h-4 text-yellow-500' />
			),
			statusColor: isHealthy ? 'text-green-600' : 'text-yellow-600',
		};
	};

	const localEnv = getEnvironmentStatus('local');
	const prodEnv = getEnvironmentStatus('production');

	const gitStatusData = gitStatus?.data;
	const pluginsData = plugins?.data?.plugins || [];
	const themesData = themes?.data?.themes || [];

	return (
		<div className='p-6 space-y-6'>
			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				{/* Environment Status */}
				<Card title='Environment Status'>
					<div className='space-y-4'>
						{/* Local Environment */}
						{localEnv && (
							<div className='p-4 bg-gray-50 rounded-lg'>
								<div className='flex items-center justify-between mb-2'>
									<div className='flex items-center space-x-2'>
										<Globe className='w-4 h-4 text-blue-500' />
										<span className='font-medium'>Local Environment</span>
									</div>
									<div className='flex items-center space-x-2'>
										{localEnv.statusIcon}
										<Badge variant={localEnv.isHealthy ? 'success' : 'warning'}>
											{localEnv.isHealthy ? 'Healthy' : 'Issues'}
										</Badge>
									</div>
								</div>
								<div className='text-sm text-gray-600 space-y-1'>
									<p>
										URL:{' '}
										<a
											href={localEnv.url}
											target='_blank'
											rel='noopener noreferrer'
											className='text-blue-600 hover:underline'
										>
											{localEnv.url}
										</a>
									</p>
									{localEnv.wordpress_version && (
										<p>WordPress: {localEnv.wordpress_version}</p>
									)}
									{localEnv.php_version && <p>PHP: {localEnv.php_version}</p>}
									<p>Health: {localEnv.health_score}%</p>
								</div>
							</div>
						)}

						{/* Production Environment */}
						{prodEnv && (
							<div className='p-4 bg-gray-50 rounded-lg'>
								<div className='flex items-center justify-between mb-2'>
									<div className='flex items-center space-x-2'>
										<Server className='w-4 h-4 text-green-500' />
										<span className='font-medium'>Production</span>
									</div>
									<Badge variant={prodEnv.isHealthy ? 'success' : 'warning'}>
										{prodEnv.isHealthy ? 'Healthy' : 'Issues'}
									</Badge>
								</div>
								<div className='text-sm text-gray-600 space-y-1'>
									<p>
										URL:{' '}
										<a
											href={prodEnv.url}
											target='_blank'
											rel='noopener noreferrer'
											className='text-blue-600 hover:underline'
										>
											{prodEnv.url}
										</a>
									</p>
									{prodEnv.wordpress_version && (
										<p>WordPress: {prodEnv.wordpress_version}</p>
									)}
									<p>Health: {prodEnv.health_score}%</p>
								</div>
							</div>
						)}

						{!localEnv && !prodEnv && (
							<div className='text-center py-8 text-gray-500'>
								<Globe className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<p>No environments configured</p>
							</div>
						)}
					</div>
				</Card>

				{/* Git Status */}
				<Card title='Git Repository Status'>
					{gitStatusData ? (
						<div className='space-y-4'>
							<div className='flex items-center justify-between'>
								<span className='text-sm font-medium'>Branch</span>
								<Badge variant='info'>{gitStatusData.branch}</Badge>
							</div>

							<div className='flex items-center justify-between'>
								<span className='text-sm font-medium'>Status</span>
								<Badge variant={gitStatusData.is_dirty ? 'warning' : 'success'}>
									{gitStatusData.is_dirty ? 'Uncommitted changes' : 'Clean'}
								</Badge>
							</div>

							{gitStatusData.last_commit && (
								<div className='p-3 bg-gray-50 rounded-lg'>
									<p className='text-sm font-medium mb-1'>Last Commit</p>
									<p className='text-xs text-gray-600 mb-1'>
										{gitStatusData.last_commit.message}
									</p>
									<p className='text-xs text-gray-500'>
										{gitStatusData.last_commit.author} •{' '}
										{new Date(
											gitStatusData.last_commit.date,
										).toLocaleDateString()}
									</p>
								</div>
							)}

							{gitStatusData.ahead > 0 && (
								<div className='flex items-center space-x-2 text-sm text-yellow-600'>
									<AlertTriangle className='w-4 h-4' />
									<span>{gitStatusData.ahead} commits ahead of origin</span>
								</div>
							)}

							{gitStatusData.behind > 0 && (
								<div className='flex items-center space-x-2 text-sm text-yellow-600'>
									<AlertTriangle className='w-4 h-4' />
									<span>{gitStatusData.behind} commits behind origin</span>
								</div>
							)}
						</div>
					) : (
						<div className='text-center py-8 text-gray-500'>
							<Code className='w-12 h-12 mx-auto mb-3 text-gray-300' />
							<p>Git status unavailable</p>
						</div>
					)}
				</Card>
			</div>

			{/* WordPress Information */}
			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				<Card title='WordPress Information'>
					<div className='space-y-3'>
						<div className='flex items-center justify-between'>
							<span className='text-sm font-medium'>Version</span>
							<span className='text-sm text-gray-600'>
								{localEnv?.wordpress_version ||
									prodEnv?.wordpress_version ||
									'Unknown'}
							</span>
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-sm font-medium'>PHP Version</span>
							<span className='text-sm text-gray-600'>
								{localEnv?.php_version || prodEnv?.php_version || 'Unknown'}
							</span>
						</div>
						<div className='flex items-center justify-between'>
							<span className='text-sm font-medium'>Database</span>
							<span className='text-sm text-gray-600'>
								{localEnv?.database_name || prodEnv?.database_name || 'Unknown'}
							</span>
						</div>
					</div>
				</Card>

				<Card title='Plugins'>
					{pluginsLoading ? (
						<div className='text-center py-4 text-gray-500'>
							<RefreshCw className='w-6 h-6 mx-auto mb-2 animate-spin' />
							<p className='text-sm'>Loading plugins...</p>
						</div>
					) : pluginsData.length === 0 ? (
						<div className='text-center py-4 text-gray-500'>
							<p className='text-sm'>No plugins found</p>
							<p className='text-xs mt-1'>
								Ensure the server is accessible and WP-CLI is available
							</p>
						</div>
					) : (
						<div className='space-y-2 max-h-48 overflow-y-auto'>
							{pluginsData.slice(0, 10).map((plugin: any, index: number) => (
								<div
									key={plugin.name || index}
									className='flex items-center justify-between py-1 text-sm border-b border-gray-100 last:border-0'
								>
									<span
										className='font-medium truncate max-w-[150px]'
										title={plugin.name}
									>
										{plugin.title || plugin.name}
									</span>
									<div className='flex items-center space-x-2'>
										<Badge
											variant={
												plugin.status === 'active'
													? 'success'
													: plugin.status === 'inactive'
														? 'secondary'
														: 'warning'
											}
										>
											{plugin.status}
										</Badge>
										{plugin.update === 'available' && (
											<Badge variant='warning'>Update</Badge>
										)}
									</div>
								</div>
							))}
							{pluginsData.length > 10 && (
								<p className='text-xs text-gray-500 text-center'>
									+{pluginsData.length - 10} more plugins
								</p>
							)}
						</div>
					)}
				</Card>

				<Card title='Themes'>
					{themesLoading ? (
						<div className='text-center py-4 text-gray-500'>
							<RefreshCw className='w-6 h-6 mx-auto mb-2 animate-spin' />
							<p className='text-sm'>Loading themes...</p>
						</div>
					) : themesData.length === 0 ? (
						<div className='text-center py-4 text-gray-500'>
							<p className='text-sm'>No themes found</p>
						</div>
					) : (
						<div className='space-y-2'>
							{themesData.map((theme: any, index: number) => (
								<div
									key={theme.name || index}
									className='flex items-center justify-between py-1 text-sm border-b border-gray-100 last:border-0'
								>
									<span
										className='font-medium truncate max-w-[150px]'
										title={theme.name}
									>
										{theme.title || theme.name}
									</span>
									<div className='flex items-center space-x-2'>
										<Badge
											variant={
												theme.status === 'active' ? 'success' : 'secondary'
											}
										>
											{theme.status}
										</Badge>
										{theme.update === 'available' && (
											<Badge variant='warning'>Update</Badge>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</Card>

				<Card title='SSL Certificate'>
					{project.ssl_certificate ? (
						<div className='space-y-3'>
							<div className='flex items-center justify-between'>
								<span className='text-sm font-medium'>Status</span>
								<Badge
									variant={
										project.ssl_certificate.status === 'valid'
											? 'success'
											: 'warning'
									}
								>
									{project.ssl_certificate.status}
								</Badge>
							</div>
							<div className='flex items-center justify-between'>
								<span className='text-sm font-medium'>Domain</span>
								<span className='text-sm text-gray-600'>
									{project.ssl_certificate.domain}
								</span>
							</div>
							{project.ssl_certificate.expiry_date && (
								<div className='flex items-center justify-between'>
									<span className='text-sm font-medium'>Expires</span>
									<span className='text-sm text-gray-600'>
										{new Date(
											project.ssl_certificate.expiry_date,
										).toLocaleDateString()}
									</span>
								</div>
							)}
						</div>
					) : (
						<div className='text-center py-4 text-gray-500'>
							<Shield className='w-8 h-8 mx-auto mb-2 text-gray-300' />
							<p className='text-sm'>No SSL certificate configured</p>
						</div>
					)}
				</Card>
			</div>

			{/* Client Information */}
			{project.client && (
				<Card title='Client Information'>
					<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
						<div className='space-y-2'>
							<div className='flex items-center space-x-2 text-sm font-medium text-gray-900'>
								<User className='w-4 h-4' />
								<span>Contact</span>
							</div>
							<p className='text-sm text-gray-600'>{project.client.name}</p>
							<p className='text-sm text-gray-600'>{project.client.email}</p>
							{project.client.phone && (
								<p className='text-sm text-gray-600'>{project.client.phone}</p>
							)}
							{project.client.company && (
								<p className='text-sm text-gray-600'>
									{project.client.company}
								</p>
							)}
						</div>

						<div className='space-y-2'>
							<div className='flex items-center space-x-2 text-sm font-medium text-gray-900'>
								<FileText className='w-4 h-4' />
								<span>Billing</span>
							</div>
							<p className='text-sm text-gray-600'>
								Status: {project.client.billing_status}
							</p>
							<p className='text-sm text-gray-600'>
								Rate: ${project.client.monthly_rate}/month
							</p>
						</div>

						<div className='space-y-2'>
							<div className='flex items-center space-x-2 text-sm font-medium text-gray-900'>
								<Calendar className='w-4 h-4' />
								<span>Contract</span>
							</div>
							{project.client.contract_start && (
								<p className='text-sm text-gray-600'>
									Start:{' '}
									{new Date(project.client.contract_start).toLocaleDateString()}
								</p>
							)}
							{project.client.contract_end && (
								<p className='text-sm text-gray-600'>
									End:{' '}
									{new Date(project.client.contract_end).toLocaleDateString()}
								</p>
							)}
						</div>

						<div className='space-y-2'>
							<div className='flex items-center space-x-2 text-sm font-medium text-gray-900'>
								<Activity className='w-4 h-4' />
								<span>Notes</span>
							</div>
							<p className='text-sm text-gray-600'>
								{project.client.notes || 'No notes'}
							</p>
						</div>
					</div>
				</Card>
			)}

			{/* Server Information */}
			{project.server && (
				<Card title='Server Information'>
					<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
						<div className='space-y-2'>
							<div className='flex items-center space-x-2 text-sm font-medium text-gray-900'>
								<Server className='w-4 h-4' />
								<span>Hosting</span>
							</div>
							<p className='text-sm text-gray-600'>
								Provider: {project.server.provider}
							</p>
							<p className='text-sm text-gray-600'>
								IP: {project.server.server_ip}
							</p>
							{project.server.server_name && (
								<p className='text-sm text-gray-600'>
									Name: {project.server.server_name}
								</p>
							)}
							{project.server.location && (
								<p className='text-sm text-gray-600'>
									Location: {project.server.location}
								</p>
							)}
						</div>

						<div className='space-y-2'>
							<div className='flex items-center space-x-2 text-sm font-medium text-gray-900'>
								<Activity className='w-4 h-4' />
								<span>Resources</span>
							</div>
							{Object.entries(project.server.resource_usage).map(
								([key, value]) => (
									<div
										key={key}
										className='flex items-center justify-between text-sm'
									>
										<span className='text-gray-600 capitalize'>
											{key.replace('_', ' ')}
										</span>
										<span className='text-gray-900'>{value as string}%</span>
									</div>
								),
							)}
						</div>

						<div className='space-y-2'>
							<div className='flex items-center space-x-2 text-sm font-medium text-gray-900'>
								<Calendar className='w-4 h-4' />
								<span>Billing</span>
							</div>
							<p className='text-sm text-gray-600'>
								Monthly: ${project.server.monthly_cost}
							</p>
							{project.server.renewal_date && (
								<p className='text-sm text-gray-600'>
									Renews:{' '}
									{new Date(project.server.renewal_date).toLocaleDateString()}
								</p>
							)}
						</div>
					</div>
				</Card>
			)}
		</div>
	);
};

export default ProjectOverview;
