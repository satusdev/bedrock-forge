import {
	Download,
	Eye,
	Globe,
	Pause,
	Play,
	RefreshCw,
	Tag,
	Trash2,
	Upload,
} from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Link } from '@/router/compat';
import type { LocalProject, RemoteProject } from './types';

type BadgeVariant =
	| 'success'
	| 'warning'
	| 'error'
	| 'info'
	| 'default'
	| 'danger'
	| 'secondary';

interface LocalProjectCardProps {
	project: LocalProject;
	getStatusColor: (status: string) => BadgeVariant;
	onAction: (projectName: string, action: string) => void;
}

interface RemoteProjectCardProps {
	project: RemoteProject;
	getStatusColor: (status: string) => BadgeVariant;
	getEnvironmentColor: (env: string) => BadgeVariant;
	tagColorMap: Map<string, string>;
	onOpenTagModal: (project: RemoteProject) => void;
	onDeleteProject: (projectId: number, projectName: string) => void;
}

export function LocalProjectCard({
	project,
	getStatusColor,
	onAction,
}: LocalProjectCardProps) {
	return (
		<Card className='hover:shadow-md transition-shadow'>
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
						{project.created_date && `Created: ${project.created_date}`}
					</div>
					<div className='flex items-center space-x-2'>
						{project.ddev_status !== 'running' ? (
							<Button
								variant='secondary'
								size='sm'
								onClick={() => onAction(project.project_name, 'start_ddev')}
							>
								<Play className='w-4 h-4' />
							</Button>
						) : (
							<Button
								variant='secondary'
								size='sm'
								onClick={() => onAction(project.project_name, 'stop_ddev')}
							>
								<Pause className='w-4 h-4' />
							</Button>
						)}
						<Button
							variant='secondary'
							size='sm'
							onClick={() => onAction(project.project_name, 'restart_ddev')}
						>
							<RefreshCw className='w-4 h-4' />
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
}

export function RemoteProjectCard({
	project,
	getStatusColor,
	getEnvironmentColor,
	tagColorMap,
	onOpenTagModal,
	onDeleteProject,
}: RemoteProjectCardProps) {
	return (
		<Card className='hover:shadow-md transition-shadow'>
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
								onClick={() => onOpenTagModal(project)}
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
							onClick={() => onOpenTagModal(project)}
							title='Manage tags'
						>
							<Tag className='w-4 h-4' />
						</Button>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => onDeleteProject(project.id, project.name)}
							className='text-red-600 hover:text-red-700 hover:bg-red-50'
						>
							<Trash2 className='w-4 h-4' />
						</Button>
					</div>
				</div>
			</div>
		</Card>
	);
}
