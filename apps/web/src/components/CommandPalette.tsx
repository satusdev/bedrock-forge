import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
	Search,
	Server,
	FolderOpen,
	Users,
	LayoutDashboard,
	FileBarChart,
	Globe,
	Shield,
	Settings,
	X,
	HardDrive,
	ClipboardList,
	ClipboardCheck,
	AlertTriangle,
	Package,
	FileText,
	Bell,
	Activity,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

interface StaticItem {
	type: 'page';
	label: string;
	path: string;
	icon: React.ElementType;
	minRole?: 'manager' | 'admin' | 'maintainer';
}

interface DynamicItem {
	type: 'client' | 'server' | 'project';
	id: number;
	label: string;
	path: string;
}

type PaletteItem = StaticItem | DynamicItem;

const STATIC_PAGES: StaticItem[] = [
	{
		type: 'page',
		label: 'Dashboard',
		path: '/dashboard',
		icon: LayoutDashboard,
	},
	{ type: 'page', label: 'Clients', path: '/clients', icon: Users },
	{ type: 'page', label: 'Servers', path: '/servers', icon: Server },
	{ type: 'page', label: 'Projects', path: '/projects', icon: FolderOpen },
	{ type: 'page', label: 'Backups', path: '/backups', icon: HardDrive },
	{ type: 'page', label: 'Domains', path: '/domains', icon: Globe },
	{ type: 'page', label: 'Monitors', path: '/monitors', icon: Activity },
	{ type: 'page', label: 'Activity', path: '/activity', icon: ClipboardList },
	{ type: 'page', label: 'Problems', path: '/problems', icon: AlertTriangle },
	{ type: 'page', label: 'Settings', path: '/settings', icon: Settings },
	{
		type: 'page',
		label: 'Packages',
		path: '/packages',
		icon: Package,
		minRole: 'manager',
	},
	{
		type: 'page',
		label: 'Invoices',
		path: '/invoices',
		icon: FileText,
		minRole: 'manager',
	},
	{
		type: 'page',
		label: 'Users & Roles',
		path: '/users',
		icon: Shield,
		minRole: 'admin',
	},
	{
		type: 'page',
		label: 'Audit Logs',
		path: '/audit-logs',
		icon: ClipboardCheck,
		minRole: 'admin',
	},
	{
		type: 'page',
		label: 'Notifications',
		path: '/notifications',
		icon: Bell,
		minRole: 'admin',
	},
	{
		type: 'page',
		label: 'Reports',
		path: '/reports',
		icon: FileBarChart,
		minRole: 'admin',
	},
];

function getItemIcon(item: PaletteItem): React.ReactNode {
	if (item.type === 'page') {
		const Icon = item.icon;
		return <Icon className='h-4 w-4 shrink-0 text-muted-foreground' />;
	}
	if (item.type === 'client')
		return <Users className='h-4 w-4 shrink-0 text-blue-500' />;
	if (item.type === 'server')
		return <Server className='h-4 w-4 shrink-0 text-green-500' />;
	return <FolderOpen className='h-4 w-4 shrink-0 text-orange-500' />;
}

function getItemLabel(item: PaletteItem): string {
	if (item.type === 'page') return item.label;
	return item.label;
}

function getItemSubLabel(item: PaletteItem): string {
	if (item.type === 'page') return 'Page';
	if (item.type === 'client') return 'Client';
	if (item.type === 'server') return 'Server';
	return 'Project';
}

const ROLE_WEIGHT: Record<string, number> = {
	admin: 4,
	manager: 3,
	maintainer: 2,
	client: 1,
};

interface CommandPaletteProps {
	open: boolean;
	onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
	const navigate = useNavigate();
	const user = useAuthStore(s => s.user);
	const userWeight = Math.max(
		...(user?.roles ?? []).map(r => ROLE_WEIGHT[r] ?? 0),
		0,
	);
	const [query, setQuery] = useState('');
	const [activeIndex, setActiveIndex] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const debouncedQuery = useDebounce(query, 250);

	const { data: clients = [] } = useQuery({
		queryKey: ['cmd-clients', debouncedQuery],
		queryFn: async () => {
			if (!debouncedQuery) return [];
			const res = await api.get<{ items: { id: number; name: string }[] }>(
				`/clients?limit=5&search=${encodeURIComponent(debouncedQuery)}`,
			);
			return res.items ?? [];
		},
		enabled: open && debouncedQuery.length > 0,
	});

	const { data: servers = [] } = useQuery({
		queryKey: ['cmd-servers', debouncedQuery],
		queryFn: async () => {
			if (!debouncedQuery) return [];
			const res = await api.get<{ items: { id: number; name: string }[] }>(
				`/servers?limit=5&search=${encodeURIComponent(debouncedQuery)}`,
			);
			return res.items ?? [];
		},
		enabled: open && debouncedQuery.length > 0,
	});

	const { data: projects = [] } = useQuery({
		queryKey: ['cmd-projects', debouncedQuery],
		queryFn: async () => {
			if (!debouncedQuery) return [];
			const res = await api.get<{ items: { id: number; name: string }[] }>(
				`/projects?limit=5&search=${encodeURIComponent(debouncedQuery)}`,
			);
			return res.items ?? [];
		},
		enabled: open && debouncedQuery.length > 0,
	});

	const filteredPages = debouncedQuery
		? STATIC_PAGES.filter(
				p =>
					p.label.toLowerCase().includes(debouncedQuery.toLowerCase()) &&
					(p.minRole ? (ROLE_WEIGHT[p.minRole] ?? 0) <= userWeight : true),
			)
		: STATIC_PAGES.filter(p =>
				p.minRole ? (ROLE_WEIGHT[p.minRole] ?? 0) <= userWeight : true,
			);

	const dynamicItems: DynamicItem[] = [
		...clients.map(c => ({
			type: 'client' as const,
			id: c.id,
			label: c.name,
			path: `/clients/${c.id}`,
		})),
		...servers.map(s => ({
			type: 'server' as const,
			id: s.id,
			label: s.name,
			path: `/servers`,
		})),
		...projects.map(p => ({
			type: 'project' as const,
			id: p.id,
			label: p.name,
			path: `/projects/${p.id}`,
		})),
	];

	const allItems: PaletteItem[] = [...filteredPages, ...dynamicItems];

	// Reset state on open
	useEffect(() => {
		if (open) {
			setQuery('');
			setActiveIndex(0);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open]);

	// Scroll active item into view
	useEffect(() => {
		const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
		el?.scrollIntoView({ block: 'nearest' });
	}, [activeIndex]);

	const handleSelect = (item: PaletteItem) => {
		navigate(item.path);
		onClose();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveIndex(i => Math.min(i + 1, allItems.length - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveIndex(i => Math.max(i - 1, 0));
		} else if (e.key === 'Enter') {
			if (allItems[activeIndex]) handleSelect(allItems[activeIndex]);
		} else if (e.key === 'Escape') {
			onClose();
		}
	};

	return (
		<Dialog open={open} onOpenChange={v => !v && onClose()}>
			<DialogContent className='p-0 max-w-xl gap-0 overflow-hidden'>
				<DialogHeader className='sr-only'>
					<DialogTitle>Search</DialogTitle>
				</DialogHeader>

				{/* Search input */}
				<div className='flex items-center gap-2 border-b px-4 py-3'>
					<Search className='h-4 w-4 shrink-0 text-muted-foreground' />
					<input
						ref={inputRef}
						value={query}
						onChange={e => {
							setQuery(e.target.value);
							setActiveIndex(0);
						}}
						onKeyDown={handleKeyDown}
						placeholder='Search pages, clients, servers, projects…'
						className='flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground'
					/>
					{query && (
						<button
							onClick={() => setQuery('')}
							className='text-muted-foreground hover:text-foreground'
							aria-label='Clear search'
						>
							<X className='h-4 w-4' />
						</button>
					)}
					<kbd className='hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground font-mono'>
						Esc
					</kbd>
				</div>

				{/* Results */}
				<div ref={listRef} className='max-h-80 overflow-y-auto py-2'>
					{allItems.length === 0 && (
						<p className='py-8 text-center text-sm text-muted-foreground'>
							No results found.
						</p>
					)}

					{allItems.map((item, i) => {
						const prevItem = allItems[i - 1];
						const isFirstOfType = !prevItem || prevItem.type !== item.type;
						const groupLabel = isFirstOfType
							? item.type === 'page'
								? 'Pages'
								: item.type === 'client'
									? 'Clients'
									: item.type === 'server'
										? 'Servers'
										: 'Projects'
							: null;
						return (
							<div
								key={`${item.type}-${item.type === 'page' ? item.path : item.id}`}
							>
								{groupLabel && (
									<div className='px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none'>
										{groupLabel}
									</div>
								)}
								<button
									data-index={i}
									onClick={() => handleSelect(item)}
									onMouseEnter={() => setActiveIndex(i)}
									className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
										i === activeIndex
											? 'bg-accent text-accent-foreground'
											: 'text-foreground'
									}`}
								>
									{getItemIcon(item)}
									<span className='flex-1 truncate'>{getItemLabel(item)}</span>
									<span className='text-xs text-muted-foreground shrink-0'>
										{getItemSubLabel(item)}
									</span>
								</button>
							</div>
						);
					})}
				</div>

				{/* Footer hint */}
				<div className='border-t px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground'>
					<span>
						<kbd className='font-mono'>↑↓</kbd> navigate
					</span>
					<span>
						<kbd className='font-mono'>↵</kbd> select
					</span>
					<span>
						<kbd className='font-mono'>Esc</kbd> close
					</span>
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** Simple debounce hook */
function useDebounce<T>(value: T, delay: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), delay);
		return () => clearTimeout(t);
	}, [value, delay]);
	return debounced;
}
