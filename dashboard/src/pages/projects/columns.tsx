import { type ColumnDef } from '@tanstack/react-table';
import { Download, Eye, Pause, Play, Tag, Trash2, Upload } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Link } from '@/router/compat';
import type { LocalProject, RemoteProject } from './types';

interface LocalColumnsProps {
	getStatusColor: (
		status: string,
	) =>
		| 'success'
		| 'warning'
		| 'error'
		| 'info'
		| 'default'
		| 'danger'
		| 'secondary';
	onAction: (projectName: string, action: string) => void;
}

interface RemoteColumnsProps {
	getStatusColor: (
		status: string,
	) =>
		| 'success'
		| 'warning'
		| 'error'
		| 'info'
		| 'default'
		| 'danger'
		| 'secondary';
	getEnvironmentColor: (
		env: string,
	) =>
		| 'success'
		| 'warning'
		| 'error'
		| 'info'
		| 'default'
		| 'danger'
		| 'secondary';
	tagColorMap: Map<string, string>;
	onOpenTagModal: (project: RemoteProject) => void;
	onDeleteProject: (projectId: number, projectName: string) => void;
}

export function createLocalProjectColumns({
	getStatusColor,
	onAction,
}: LocalColumnsProps): ColumnDef<LocalProject>[] {
	return [
		{
			accessorKey: 'project_name',
			header: 'Project',
			cell: ({ row }) => {
				const project = row.original;

				return (
					<div className='space-y-1'>
						<div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
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
					</div>
				);
			},
		},
		{
			accessorKey: 'directory',
			header: 'Directory',
			cell: ({ row }) => (
				<div className='text-sm text-gray-500 max-w-xs truncate dark:text-gray-400'>
					{row.original.directory}
				</div>
			),
		},
		{
			accessorKey: 'ddev_status',
			header: 'Status',
			cell: ({ row }) => (
				<Badge variant={getStatusColor(row.original.ddev_status)}>
					{row.original.ddev_status}
				</Badge>
			),
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => {
				const project = row.original;
				const isRunning = project.ddev_status === 'running';

				return (
					<div className='flex items-center space-x-2'>
						<Button
							variant='secondary'
							size='sm'
							onClick={() =>
								onAction(
									project.project_name,
									isRunning ? 'stop_ddev' : 'start_ddev',
								)
							}
						>
							{isRunning ? (
								<Pause className='w-4 h-4' />
							) : (
								<Play className='w-4 h-4' />
							)}
						</Button>
					</div>
				);
			},
		},
	];
}

export function createRemoteProjectColumns({
	getStatusColor,
	getEnvironmentColor,
	tagColorMap,
	onOpenTagModal,
	onDeleteProject,
}: RemoteColumnsProps): ColumnDef<RemoteProject>[] {
	return [
		{
			accessorKey: 'name',
			header: 'Project',
			cell: ({ row }) => (
				<div>
					<div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
						{row.original.name}
					</div>
					<div className='text-xs text-gray-500 dark:text-gray-400'>
						{row.original.domain}
					</div>
				</div>
			),
		},
		{
			accessorKey: 'server_name',
			header: 'Server',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500 dark:text-gray-400'>
					{row.original.server_name || 'N/A'}
				</span>
			),
		},
		{
			accessorKey: 'environment',
			header: 'Environment',
			cell: ({ row }) => (
				<Badge variant={getEnvironmentColor(row.original.environment)}>
					{row.original.environment}
				</Badge>
			),
		},
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }) => (
				<Badge variant={getStatusColor(row.original.status)}>
					{row.original.status}
				</Badge>
			),
		},
		{
			accessorKey: 'tags',
			header: 'Tags',
			cell: ({ row }) => {
				const tags = row.original.tags || [];

				if (tags.length === 0) {
					return <span className='text-xs text-gray-400'>No tags</span>;
				}

				return (
					<div className='flex flex-wrap gap-1'>
						{tags.slice(0, 2).map(tag => (
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
						{tags.length > 2 && (
							<span className='text-xs text-gray-500'>
								+{tags.length - 2} more
							</span>
						)}
					</div>
				);
			},
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => {
				const project = row.original;

				return (
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
							onClick={() => onOpenTagModal(project)}
							title='Manage tags'
						>
							<Tag className='w-4 h-4' />
						</Button>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => onDeleteProject(project.id, project.name)}
							className='text-red-600'
						>
							<Trash2 className='w-4 h-4' />
						</Button>
					</div>
				);
			},
		},
	];
}
