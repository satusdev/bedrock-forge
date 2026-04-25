import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	Globe,
	Package,
	Shield,
	User2,
	Pencil,
	ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnvironmentsTab } from './project-detail/EnvironmentsTab';
import { BackupsTab } from './project-detail/BackupsTab';
import { PluginsTab } from './project-detail/PluginsTab';
import { SyncTab } from './project-detail/SyncTab';
import { RestoreTab } from './project-detail/RestoreTab';
import { ToolsTab } from './project-detail/ToolsTab';
import { DriftTab } from './project-detail/DriftTab';
import { ProjectFormDialog } from './ProjectsPage';

interface Server {
	id: number;
	name: string;
	ip_address: string;
	status: string;
}

interface Environment {
	id: number;
	type: string;
	url?: string;
	root_path?: string;
	backup_path?: string;
	google_drive_folder_id: string | null;
	server: Server;
}

interface Project {
	id: number;
	name: string;
	status: 'active' | 'inactive' | 'archived';
	client: { id: number; name: string };
	hosting_package: { id: number; name: string; price_monthly: number } | null;
	support_package: { id: number; name: string; price_monthly: number } | null;
	environments: Environment[];
	created_at: string;
}

const STATUS_VARIANT = {
	active: 'default',
	inactive: 'secondary',
	archived: 'outline',
} as const;

function ProjectHeader({
	project,
	onEdit,
}: {
	project: Project;
	onEdit: () => void;
}) {
	const navigate = useNavigate();

	return (
		<div className='space-y-4'>
			<Button
				variant='ghost'
				size='sm'
				className='-ml-1'
				onClick={() => navigate('/projects')}
			>
				<ArrowLeft className='h-4 w-4 mr-1.5' />
				All Projects
			</Button>

			<div className='flex flex-wrap items-start gap-4 justify-between'>
				<div>
					<div className='flex items-center gap-3 flex-wrap'>
						<h1 className='text-3xl font-bold tracking-tight'>
							{project.name}
						</h1>
						<Badge
							variant={STATUS_VARIANT[project.status] ?? 'secondary'}
							className='text-sm'
						>
							{project.status}
						</Badge>
					</div>
					<div className='flex items-center gap-1.5 text-muted-foreground text-sm mt-1'>
						<User2 className='h-3.5 w-3.5' />
						{project.client.name}
					</div>
				</div>
				<Button variant='outline' size='sm' onClick={onEdit}>
					<Pencil className='h-4 w-4 mr-1.5' />
					Edit Project
				</Button>
			</div>

			<div className='flex flex-wrap gap-3'>
				{project.hosting_package && (
					<div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2'>
						<Package className='h-4 w-4 text-muted-foreground' />
						<div>
							<p className='text-xs text-muted-foreground'>Hosting</p>
							<p className='text-sm font-medium'>
								{project.hosting_package.name}
							</p>
						</div>
					</div>
				)}
				{project.support_package && (
					<div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2'>
						<Shield className='h-4 w-4 text-muted-foreground' />
						<div>
							<p className='text-xs text-muted-foreground'>Support</p>
							<p className='text-sm font-medium'>
								{project.support_package.name}
							</p>
						</div>
					</div>
				)}
				<div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2'>
					<Globe className='h-4 w-4 text-muted-foreground' />
					<div>
						<p className='text-xs text-muted-foreground'>Environments</p>
						<p className='text-sm font-medium'>{project.environments.length}</p>
					</div>
				</div>
			</div>
		</div>
	);
}

function HeaderSkeleton() {
	return (
		<div className='space-y-4'>
			<Skeleton className='h-8 w-32' />
			<Skeleton className='h-10 w-60' />
			<div className='flex gap-3'>
				<Skeleton className='h-14 w-36 rounded-lg' />
				<Skeleton className='h-14 w-36 rounded-lg' />
			</div>
		</div>
	);
}

export function ProjectDetailPage() {
	const { id } = useParams<{ id: string }>();
	const projectId = Number(id);
	const qc = useQueryClient();
	const [editOpen, setEditOpen] = useState(false);

	const {
		data: project,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ['project', projectId],
		enabled: !!projectId,
		queryFn: () => api.get<Project>(`/projects/${projectId}`),
	});

	const { data: clients = [] } = useQuery({
		queryKey: ['clients-list'],
		queryFn: () =>
			api
				.get<{ items: { id: number; name: string }[] }>('/clients?limit=100')
				.then(r => r.items),
	});

	const { data: hostingPkgs = [] } = useQuery({
		queryKey: ['packages-hosting'],
		queryFn: () =>
			api.get<{ id: number; name: string; price_monthly: number }[]>(
				'/packages/hosting',
			),
	});

	const { data: supportPkgs = [] } = useQuery({
		queryKey: ['packages-support'],
		queryFn: () =>
			api.get<{ id: number; name: string; price_monthly: number }[]>(
				'/packages/support',
			),
	});

	if (isLoading) {
		return (
			<div className='container mx-auto py-8 px-4 max-w-6xl space-y-6'>
				<HeaderSkeleton />
				<Skeleton className='h-10 w-full rounded-lg' />
				<Skeleton className='h-64 w-full rounded-xl' />
			</div>
		);
	}

	if (isError || !project) {
		return (
			<div className='container mx-auto py-16 px-4 text-center text-muted-foreground'>
				<p className='text-lg font-medium'>Project not found</p>
				<Button
					className='mt-4'
					variant='outline'
					onClick={() => history.back()}
				>
					<ArrowLeft className='h-4 w-4 mr-1.5' />
					Go Back
				</Button>
			</div>
		);
	}

	const environments = project.environments ?? [];

	return (
		<div className='container mx-auto py-8 px-4 max-w-6xl space-y-6'>
			<ProjectHeader project={project} onEdit={() => setEditOpen(true)} />

			<Tabs defaultValue='environments' className='space-y-6'>
				<TabsList className='flex-wrap h-auto gap-1'>
					<TabsTrigger value='environments'>
						Environments
						{environments.length > 0 && (
							<span className='ml-1.5 text-xs opacity-70'>
								({environments.length})
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger value='backups'>Backups</TabsTrigger>
					<TabsTrigger value='plugins'>Plugins</TabsTrigger>
					<TabsTrigger value='sync'>Sync</TabsTrigger>
					<TabsTrigger value='restore'>Restore</TabsTrigger>
					<TabsTrigger value='tools'>Tools</TabsTrigger>
					<TabsTrigger value='drift'>Drift</TabsTrigger>
				</TabsList>

				<TabsContent value='environments'>
					<EnvironmentsTab projectId={projectId} />
				</TabsContent>

				<TabsContent value='backups'>
					<BackupsTab projectId={projectId} environments={environments} />
				</TabsContent>

				<TabsContent value='plugins'>
					<PluginsTab projectId={projectId} environments={environments} />
				</TabsContent>

				<TabsContent value='sync'>
					<SyncTab projectId={projectId} environments={environments} />
				</TabsContent>

				<TabsContent value='restore'>
					<RestoreTab projectId={projectId} environments={environments} />
				</TabsContent>

				<TabsContent value='tools'>
					<ToolsTab environments={environments} />
				</TabsContent>

				<TabsContent value='drift'>
					<DriftTab projectId={projectId} environments={environments} />
				</TabsContent>
			</Tabs>

			<ProjectFormDialog
				open={editOpen}
				onOpenChange={setEditOpen}
				initial={
					project as unknown as Parameters<
						typeof ProjectFormDialog
					>[0]['initial']
				}
				clients={clients}
				hostingPackages={hostingPkgs}
				supportPackages={supportPkgs}
				onSuccess={() => {
					qc.invalidateQueries({ queryKey: ['project', projectId] });
					qc.invalidateQueries({ queryKey: ['projects'] });
					setEditOpen(false);
				}}
			/>
		</div>
	);
}
