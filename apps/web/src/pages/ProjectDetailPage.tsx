import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	Globe,
	Package,
	Shield,
	User2,
	Pencil,
	ExternalLink,
	History,
	Puzzle,
	RefreshCw,
	Undo2,
	Wrench,
	GitCompare,
	Palette,
	Cpu,
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
import { ThemesTab } from './project-detail/ThemesTab';
import { WpCoreTab } from './project-detail/WpCoreTab';
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

function ProjectHeader({
	project,
	onEdit,
}: {
	project: Project;
	onEdit: () => void;
}) {
	const navigate = useNavigate();

	const getStatusBadge = (status: string) => {
		switch (status) {
			case 'active':
				return (
					<Badge className='bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors font-semibold shadow-sm text-xs px-2.5 py-1 capitalize'>
						Active
					</Badge>
				);
			case 'inactive':
				return (
					<Badge className='bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors font-semibold shadow-sm text-xs px-2.5 py-1 capitalize'>
						Inactive
					</Badge>
				);
			default:
				return (
					<Badge className='bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-950/50 transition-colors font-semibold shadow-sm text-xs px-2.5 py-1 capitalize'>
						{status}
					</Badge>
				);
		}
	};

	return (
		<div className='space-y-4'>
			<Button
				variant='ghost'
				size='sm'
				className='-ml-1 text-muted-foreground hover:text-foreground transition-colors'
				onClick={() => navigate('/projects')}
			>
				<ArrowLeft className='h-4 w-4 mr-1.5' />
				All Projects
			</Button>

			<div className='flex flex-wrap items-start gap-4 justify-between border-b pb-4'>
				<div>
					<div className='flex items-center gap-3 flex-wrap'>
						<h1 className='text-4xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/75 bg-clip-text text-transparent'>
							{project.name}
						</h1>
						{getStatusBadge(project.status)}
					</div>
					<div className='flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm mt-2'>
						<div className='flex items-center justify-center h-5 w-5 rounded-full bg-muted/80 text-muted-foreground'>
							<User2 className='h-3 w-3' />
						</div>
						<span className='font-medium'>{project.client.name}</span>
					</div>
				</div>
				<Button variant='outline' size='sm' className='shadow-sm hover:bg-accent/50 transition-colors' onClick={onEdit}>
					<Pencil className='h-4 w-4 mr-1.5' />
					Edit Project Details
				</Button>
			</div>

			<div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2'>
				{project.hosting_package && (
					<div className='flex items-center gap-3.5 rounded-xl border bg-card/45 hover:bg-card/85 transition-all duration-200 shadow-sm p-4 backdrop-blur-sm group'>
						<div className='p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100 dark:border-blue-900 group-hover:scale-105 transition-transform duration-200'>
							<Package className='h-5 w-5' />
						</div>
						<div>
							<p className='text-xs text-muted-foreground font-medium'>Hosting Package</p>
							<p className='text-sm font-semibold tracking-tight mt-0.5'>
								{project.hosting_package.name}
							</p>
							<p className='text-xs text-muted-foreground/80 mt-0.5'>
								${project.hosting_package.price_monthly}/mo
							</p>
						</div>
					</div>
				)}
				{project.support_package && (
					<div className='flex items-center gap-3.5 rounded-xl border bg-card/45 hover:bg-card/85 transition-all duration-200 shadow-sm p-4 backdrop-blur-sm group'>
						<div className='p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900 group-hover:scale-105 transition-transform duration-200'>
							<Shield className='h-5 w-5' />
						</div>
						<div>
							<p className='text-xs text-muted-foreground font-medium'>Support Package</p>
							<p className='text-sm font-semibold tracking-tight mt-0.5'>
								{project.support_package.name}
							</p>
							<p className='text-xs text-muted-foreground/80 mt-0.5'>
								${project.support_package.price_monthly}/mo
							</p>
						</div>
					</div>
				)}
				<div className='flex items-center gap-3.5 rounded-xl border bg-card/45 hover:bg-card/85 transition-all duration-200 shadow-sm p-4 backdrop-blur-sm group'>
					<div className='p-2.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400 border border-purple-100 dark:border-purple-900 group-hover:scale-105 transition-transform duration-200'>
						<Globe className='h-5 w-5' />
					</div>
					<div>
						<p className='text-xs text-muted-foreground font-medium'>Environments</p>
						<p className='text-sm font-semibold tracking-tight mt-0.5'>
							{project.environments.length} {project.environments.length === 1 ? 'Environment' : 'Environments'}
						</p>
						<p className='text-xs text-muted-foreground/80 mt-0.5 truncate max-w-[200px]'>
							{project.environments.map(e => e.type).join(', ') || 'None configured'}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

function HeaderSkeleton() {
	return (
		<div className='space-y-4 border-b pb-4'>
			<Skeleton className='h-8 w-32' />
			<Skeleton className='h-10 w-80' />
			<div className='grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2'>
				<Skeleton className='h-[76px] rounded-xl' />
				<Skeleton className='h-[76px] rounded-xl' />
				<Skeleton className='h-[76px] rounded-xl' />
			</div>
		</div>
	);
}

export function ProjectDetailPage() {
	const navigate = useNavigate();
	const { id } = useParams<{ id: string }>();
	const projectId = Number(id);
	const qc = useQueryClient();
	const [editOpen, setEditOpen] = useState(false);
	const [searchParams, setSearchParams] = useSearchParams();
	const currentTab = searchParams.get('tab') || 'environments';
	const [activatedTabs, setActivatedTabs] = useState<Set<string>>(
		new Set([currentTab]),
	);

	useEffect(() => {
		setActivatedTabs(prev => {
			if (prev.has(currentTab)) return prev;
			const next = new Set(prev);
			next.add(currentTab);
			return next;
		});
	}, [currentTab]);

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
					onClick={() => navigate(-1)}
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

			<Tabs
				value={currentTab}
				className='space-y-6'
				onValueChange={v => {
					setSearchParams(prev => {
						const next = new URLSearchParams(prev);
						next.set('tab', v);
						return next;
					});
				}}
			>
				<TabsList className='flex-wrap h-auto gap-1 bg-muted/60 p-1 border border-border/40 rounded-xl shadow-sm backdrop-blur-sm'>
					<TabsTrigger 
						value='environments'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<Globe className='h-3.5 w-3.5 opacity-70' />
						Environments
						{environments.length > 0 && (
							<span className='ml-1 text-xs opacity-60 bg-muted px-1.5 py-0.5 rounded-full font-semibold border border-border/30'>
								{environments.length}
							</span>
						)}
					</TabsTrigger>
					<TabsTrigger 
						value='backups'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<History className='h-3.5 w-3.5 opacity-70' />
						Backups
					</TabsTrigger>
					<TabsTrigger 
						value='plugins'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<Puzzle className='h-3.5 w-3.5 opacity-70' />
						Plugins
					</TabsTrigger>
					<TabsTrigger 
						value='sync'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<RefreshCw className='h-3.5 w-3.5 opacity-70' />
						Sync
					</TabsTrigger>
					<TabsTrigger 
						value='restore'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<Undo2 className='h-3.5 w-3.5 opacity-70' />
						Restore
					</TabsTrigger>
					<TabsTrigger 
						value='tools'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<Wrench className='h-3.5 w-3.5 opacity-70' />
						Tools
					</TabsTrigger>
					<TabsTrigger 
						value='drift'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<GitCompare className='h-3.5 w-3.5 opacity-70' />
						Drift
					</TabsTrigger>
					<TabsTrigger 
						value='themes'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<Palette className='h-3.5 w-3.5 opacity-70' />
						Themes
					</TabsTrigger>
					<TabsTrigger 
						value='wp-core'
						className='gap-1.5 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm'
					>
						<Cpu className='h-3.5 w-3.5 opacity-70' />
						WP Core
					</TabsTrigger>
				</TabsList>

				<TabsContent value='environments'>
					{activatedTabs.has('environments') && (
						<EnvironmentsTab projectId={projectId} />
					)}
				</TabsContent>

				<TabsContent value='backups'>
					{activatedTabs.has('backups') && (
						<BackupsTab projectId={projectId} environments={environments} />
					)}
				</TabsContent>

				<TabsContent value='plugins'>
					{activatedTabs.has('plugins') && (
						<PluginsTab projectId={projectId} environments={environments} />
					)}
				</TabsContent>

				<TabsContent value='sync'>
					{activatedTabs.has('sync') && (
						<SyncTab projectId={projectId} environments={environments} />
					)}
				</TabsContent>

				<TabsContent value='restore'>
					{activatedTabs.has('restore') && (
						<RestoreTab projectId={projectId} environments={environments} />
					)}
				</TabsContent>

				<TabsContent value='tools'>
					{activatedTabs.has('tools') && (
						<ToolsTab environments={environments} />
					)}
				</TabsContent>

				<TabsContent value='drift'>
					{activatedTabs.has('drift') && (
						<DriftTab projectId={projectId} environments={environments} />
					)}
				</TabsContent>

				<TabsContent value='themes'>
					{activatedTabs.has('themes') && (
						<ThemesTab projectId={projectId} environments={environments} />
					)}
				</TabsContent>

				<TabsContent value='wp-core'>
					{activatedTabs.has('wp-core') && (
						<WpCoreTab environments={environments} />
					)}
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
