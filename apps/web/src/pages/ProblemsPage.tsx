import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/crud';

interface AttentionItem {
	id: string;
	severity: 'critical' | 'warning' | 'info';
	type: string;
	title: string;
	description: string;
	environmentId?: number;
	projectId?: number;
	projectName?: string;
	action: string;
	actionPayload: Record<string, unknown>;
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

const SEVERITY_CONFIG = {
	critical: {
		icon: AlertCircle,
		label: 'Critical',
		badgeVariant: 'destructive' as const,
		rowClass: 'border-l-4 border-l-destructive',
		iconClass: 'text-destructive',
	},
	warning: {
		icon: AlertTriangle,
		label: 'Warning',
		badgeVariant: 'warning' as const,
		rowClass: 'border-l-4 border-l-yellow-500',
		iconClass: 'text-yellow-500',
	},
	info: {
		icon: Info,
		label: 'Info',
		badgeVariant: 'secondary' as const,
		rowClass: 'border-l-4 border-l-muted-foreground',
		iconClass: 'text-muted-foreground',
	},
};

export function ProblemsPage() {
	const [page, setPage] = useState(1);
	const PAGE_SIZE = 20;
	const { data: items = [], isLoading } = useQuery<AttentionItem[]>({
		queryKey: ['attention'],
		queryFn: () => api.get('/dashboard/attention'),
		staleTime: 30_000,
	});

	const sorted = [...items].sort(
		(a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
	);

	const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
	const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	const counts = {
		critical: items.filter(i => i.severity === 'critical').length,
		warning: items.filter(i => i.severity === 'warning').length,
		info: items.filter(i => i.severity === 'info').length,
	};

	return (
		<div className='space-y-6 max-w-4xl'>
			<div>
				<h1 className='text-2xl font-bold'>Problems</h1>
				<p className='text-muted-foreground text-sm mt-1'>
					Items across all projects that need your attention.
				</p>
			</div>

			{/* Summary badges */}
			{!isLoading && items.length > 0 && (
				<div className='flex gap-3 flex-wrap'>
					{counts.critical > 0 && (
						<Badge variant='destructive'>{counts.critical} critical</Badge>
					)}
					{counts.warning > 0 && (
						<Badge variant='warning'>
							{counts.warning} warning{counts.warning !== 1 ? 's' : ''}
						</Badge>
					)}
					{counts.info > 0 && (
						<Badge variant='secondary'>{counts.info} info</Badge>
					)}
				</div>
			)}

			{isLoading ? (
				<div className='space-y-3'>
					{[1, 2, 3].map(i => (
						<Skeleton key={i} className='h-16 rounded-lg' />
					))}
				</div>
			) : sorted.length === 0 ? (
				<div className='border rounded-lg p-8 text-center'>
					<AlertTriangle className='h-8 w-8 text-muted-foreground mx-auto mb-3' />
					<p className='font-medium'>No problems found</p>
					<p className='text-sm text-muted-foreground mt-1'>
						All systems are running normally.
					</p>
				</div>
			) : (
				<>
					<div className='border rounded-lg divide-y overflow-hidden'>
						{paged.map(item => {
							const cfg = SEVERITY_CONFIG[item.severity];
							const SeverityIcon = cfg.icon;
							return (
								<div
									key={item.id}
									className={`flex items-start gap-4 px-4 py-3 bg-card ${cfg.rowClass}`}
								>
									<SeverityIcon
										className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.iconClass}`}
									/>
									<div className='flex-1 min-w-0'>
										<div className='flex items-center gap-2 flex-wrap'>
											<span className='font-medium text-sm'>{item.title}</span>
											<Badge variant={cfg.badgeVariant} className='text-xs'>
												{item.type.replace(/_/g, ' ')}
											</Badge>
										</div>
										<p className='text-xs text-muted-foreground mt-0.5 line-clamp-2'>
											{item.description}
										</p>
										{item.projectName && (
											<p className='text-xs text-muted-foreground mt-0.5'>
												Project:{' '}
												{item.projectId ? (
													<Link
														to={`/projects/${item.projectId}`}
														className='text-primary hover:underline inline-flex items-center gap-0.5'
													>
														{item.projectName}
														<ExternalLink className='h-2.5 w-2.5' />
													</Link>
												) : (
													item.projectName
												)}
											</p>
										)}
									</div>
									<Badge
										variant={cfg.badgeVariant}
										className='shrink-0 text-xs capitalize'
									>
										{item.severity}
									</Badge>
								</div>
							);
						})}
					</div>
					<Pagination
						page={page}
						totalPages={totalPages}
						onPageChange={setPage}
					/>
				</>
			)}
		</div>
	);
}
