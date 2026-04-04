import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeft, Menu, Search } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { api } from '@/lib/api-client';
import { getSocket } from '@/lib/websocket';
import { Button } from '@/components/ui/button';
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet';
import { SidebarInner } from './Sidebar';

const ROUTE_LABELS: Record<string, string> = {
	dashboard: 'Dashboard',
	clients: 'Clients',
	servers: 'Servers',
	projects: 'Projects',
	backups: 'Backups',
	monitors: 'Monitors',
	domains: 'Domains',
	settings: 'Settings',
	users: 'Users & Roles',
	'audit-logs': 'Audit Logs',
	packages: 'Packages',
	invoices: 'Invoices',
	activity: 'Activity',
	notifications: 'Notifications',
};

type WsStatus = 'connected' | 'reconnecting' | 'disconnected';

function WsStatusDot() {
	const [status, setStatus] = useState<WsStatus>('disconnected');

	useEffect(() => {
		const socket = getSocket();
		if (socket.connected) setStatus('connected');

		const onConnect = () => setStatus('connected');
		const onDisconnect = () => setStatus('disconnected');
		const onReconnecting = () => setStatus('reconnecting');

		socket.on('connect', onConnect);
		socket.on('disconnect', onDisconnect);
		socket.on('reconnect_attempt', onReconnecting);

		return () => {
			socket.off('connect', onConnect);
			socket.off('disconnect', onDisconnect);
			socket.off('reconnect_attempt', onReconnecting);
		};
	}, []);

	const dotClass =
		status === 'connected'
			? 'bg-green-500'
			: status === 'reconnecting'
				? 'bg-amber-400 animate-pulse'
				: 'bg-red-500';

	const label =
		status === 'connected'
			? 'WebSocket connected'
			: status === 'reconnecting'
				? 'WebSocket reconnecting…'
				: 'WebSocket disconnected';

	return (
		<span
			title={label}
			aria-label={label}
			className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`}
		/>
	);
}

function Breadcrumb() {
	const location = useLocation();
	const segments = location.pathname.split('/').filter(Boolean);
	const crumbs = segments.map(s => ROUTE_LABELS[s] ?? s);
	return (
		<div className='flex items-center gap-1.5 text-sm'>
			{crumbs.map((crumb, i) => (
				<span key={i} className='flex items-center gap-1.5'>
					{i > 0 && <span className='text-muted-foreground/60'>/</span>}
					<span
						className={
							i === crumbs.length - 1
								? 'font-semibold text-foreground'
								: 'text-muted-foreground'
						}
					>
						{crumb}
					</span>
				</span>
			))}
		</div>
	);
}

export function Header({ onOpenSearch }: { onOpenSearch?: () => void }) {
	const { user, logout } = useAuthStore();
	const { sidebarCollapsed, toggleSidebar } = useUiStore();

	const handleLogout = async () => {
		try {
			const { refreshToken } = useAuthStore.getState();
			await api.post('/auth/logout', { refreshToken });
		} catch {
			/* ignore */
		}
		logout();
	};

	return (
		<header className='h-14 border-b flex items-center justify-between px-4 bg-card shrink-0 gap-4'>
			<div className='flex items-center gap-3'>
				{/* Mobile sidebar trigger */}
				<Sheet>
					<SheetTrigger asChild>
						<Button variant='ghost' size='icon' className='h-8 w-8 lg:hidden'>
							<Menu className='h-4 w-4' />
							<span className='sr-only'>Open menu</span>
						</Button>
					</SheetTrigger>
					<SheetContent side='left' className='p-0 w-72'>
						<SheetHeader className='sr-only'>
							<SheetTitle>Navigation</SheetTitle>
						</SheetHeader>
						<SidebarInner collapsed={false} />
					</SheetContent>
				</Sheet>

				{/* Desktop collapse toggle */}
				<Button
					variant='ghost'
					size='icon'
					className='h-8 w-8 hidden lg:flex'
					onClick={toggleSidebar}
					title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
				>
					{sidebarCollapsed ? (
						<PanelLeft className='h-4 w-4' />
					) : (
						<PanelLeftClose className='h-4 w-4' />
					)}
				</Button>

				<Breadcrumb />
			</div>

			<div className='flex items-center gap-3'>
				<WsStatusDot />
				{onOpenSearch && (
					<Button
						variant='outline'
						size='sm'
						onClick={onOpenSearch}
						className='hidden md:flex items-center gap-2 text-muted-foreground text-xs h-8 px-3 w-48 justify-start'
					>
						<Search className='h-3.5 w-3.5' />
						<span>Search…</span>
						<kbd className='ml-auto font-mono text-xs'>⌘K</kbd>
					</Button>
				)}
				<span className='text-sm text-muted-foreground hidden sm:block'>
					{user?.email}
				</span>
				<Button
					variant='ghost'
					size='sm'
					onClick={handleLogout}
					className='text-muted-foreground hover:text-foreground'
				>
					Sign out
				</Button>
			</div>
		</header>
	);
}
