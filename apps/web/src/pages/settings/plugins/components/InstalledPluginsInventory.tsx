import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/crud';
import { usePluginInventory } from '../hooks';
import { PluginInventoryItem } from '../types';

function sourceLabel(source: string) {
	if (source === 'composer') return 'Composer';
	if (source === 'github') return 'GitHub';
	return 'Manual';
}

export function InstalledPluginsInventory() {
	const [search, setSearch] = useState('');
	const { data, isLoading, isError, refetch } = usePluginInventory();

	const items = data?.items ?? [];
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return items;
		return items.filter(item =>
			[
				item.name,
				item.slug,
				item.project.name,
				item.client.name,
				item.environment.type,
				item.source,
			]
				.filter(Boolean)
				.some(value => String(value).toLowerCase().includes(q)),
		);
	}, [items, search]);

	const columns: Column<PluginInventoryItem>[] = [
		{
			header: 'Plugin',
			render: item => (
				<div>
					<div className='font-medium'>{item.name || item.slug}</div>
					<div className='text-xs text-muted-foreground font-mono'>
						{item.slug}
					</div>
				</div>
			),
		},
		{
			header: 'Environment',
			render: item => (
				<div>
					<Link
						to={`/projects/${item.project.id}?tab=plugins&env=${item.environment.id}`}
						className='font-medium hover:text-primary'
					>
						{item.project.name}
					</Link>
					<div className='text-xs text-muted-foreground'>
						{item.environment.type} · {item.client.name}
					</div>
				</div>
			),
		},
		{
			header: 'Version',
			render: item => (
				<div className='font-mono text-xs'>
					{item.version ?? 'unknown'}
					{item.composer_constraint && (
						<span className='ml-1 text-muted-foreground'>
							{item.composer_constraint}
						</span>
					)}
				</div>
			),
		},
		{
			header: 'Source',
			render: item => (
				<Badge variant='outline'>{sourceLabel(item.source)}</Badge>
			),
		},
		{
			header: 'Status',
			render: item =>
				item.status === 'active' ? (
					<Badge>Active</Badge>
				) : (
					<Badge variant='secondary'>{item.status ?? 'Unknown'}</Badge>
				),
		},
		{
			header: 'Updates',
			render: item =>
				item.update_available ? (
					<div className='text-xs font-medium text-amber-600 dark:text-amber-400'>
						{item.latest_version ?? 'Available'}
					</div>
				) : (
					<span className='text-xs text-muted-foreground'>Up to date</span>
				),
		},
	];

	return (
		<div className='space-y-3'>
			<div className='flex flex-wrap items-center gap-3'>
				<div className='relative flex-1 min-w-56'>
					<Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
					<Input
						value={search}
						onChange={e => setSearch(e.target.value)}
						placeholder='Search installed plugins...'
						className='pl-9'
					/>
				</div>
				<span className='text-sm text-muted-foreground'>
					{filtered.length} plugins · {data?.environments_scanned ?? 0} envs
				</span>
			</div>

			<DataTable
				columns={columns}
				data={filtered}
				isLoading={isLoading}
				isError={isError}
				onRetry={refetch}
				rowKey={item => `${item.environment.id}:${item.slug}`}
				emptyMessage='No scanned plugins found.'
				emptyDescription='Run a plugin scan on an environment to populate this inventory.'
				renderActions={item => (
					<Button asChild size='sm' variant='outline'>
						<Link to={`/projects/${item.project.id}?tab=plugins&env=${item.environment.id}`}>
							<ExternalLink className='h-3.5 w-3.5 mr-1.5' />
							Manage
						</Link>
					</Button>
				)}
			/>
		</div>
	);
}
