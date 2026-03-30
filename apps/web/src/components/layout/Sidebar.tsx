import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import {
	LayoutDashboard,
	Users,
	Server,
	FolderKanban,
	HardDrive,
	Activity,
	ClipboardList,
	Settings,
	Moon,
	Sun,
	Shield,
	Package,
	FileText,
	Bell,
} from 'lucide-react';

const navItems = [
	{ to: '/', label: 'Dashboard', icon: LayoutDashboard },
	{ to: '/clients', label: 'Clients', icon: Users },
	{ to: '/servers', label: 'Servers', icon: Server },
	{ to: '/projects', label: 'Projects', icon: FolderKanban },
	{ to: '/backups', label: 'Backups', icon: HardDrive },
	{ to: '/monitors', label: 'Monitors', icon: Activity },
	{ to: '/activity', label: 'Activity', icon: ClipboardList },
	{ to: '/packages', label: 'Packages', icon: Package, minRole: 'manager' },
	{ to: '/invoices', label: 'Invoices', icon: FileText, minRole: 'manager' },
	{ to: '/settings', label: 'Settings', icon: Settings },
	{ to: '/users', label: 'Users & Roles', icon: Shield, minRole: 'admin' },
	{
		to: '/notifications',
		label: 'Notifications',
		icon: Bell,
		minRole: 'admin',
	},
];

function NavItem({
	to,
	label,
	icon: Icon,
	collapsed,
}: {
	to: string;
	label: string;
	icon: React.ElementType;
	collapsed: boolean;
	minRole?: string;
}) {
	const link = (
		<NavLink
			to={to}
			className={({ isActive }) =>
				cn(
					'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors relative group',
					collapsed ? 'justify-center px-2' : '',
					isActive
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground',
				)
			}
		>
			<Icon className='h-4 w-4 shrink-0' />
			{!collapsed && <span>{label}</span>}
		</NavLink>
	);

	if (collapsed) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>{link}</TooltipTrigger>
				<TooltipContent side='right'>{label}</TooltipContent>
			</Tooltip>
		);
	}

	return link;
}

interface SidebarInnerProps {
	collapsed?: boolean;
}

export function SidebarInner({ collapsed = false }: SidebarInnerProps) {
	const user = useAuthStore(s => s.user);
	const { darkMode, toggleDarkMode } = useUiStore();
	const initials = user?.name
		? user.name
				.split(' ')
				.map(n => n[0])
				.join('')
				.toUpperCase()
				.slice(0, 2)
		: (user?.email?.[0]?.toUpperCase() ?? 'U');
	const role = user?.roles?.[0] ?? '';

	return (
		<TooltipProvider delayDuration={0}>
			<div className='flex flex-col h-full'>
				{/* Logo */}
				<div
					className={cn(
						'h-14 flex items-center border-b shrink-0',
						collapsed ? 'justify-center px-2' : 'px-5',
					)}
				>
					<div className='flex items-center gap-2.5 min-w-0'>
						<div className='w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0'>
							B
						</div>
						{!collapsed && (
							<span className='font-bold text-base tracking-tight truncate'>
								Bedrock Forge
							</span>
						)}
					</div>
				</div>

				{/* Nav */}
				<nav
					className={cn(
						'flex-1 py-3 space-y-0.5 overflow-y-auto',
						collapsed ? 'px-2' : 'px-3',
					)}
				>
					{navItems.map(item => {
						const ROLE_WEIGHT: Record<string, number> = {
							admin: 3,
							manager: 2,
							client: 1,
						};
						const userRoles = user?.roles ?? [];
						const userWeight = Math.max(
							...userRoles.map(r => ROLE_WEIGHT[r] ?? 0),
							0,
						);
						const minWeight = item.minRole
							? (ROLE_WEIGHT[item.minRole] ?? 0)
							: 0;
						if (minWeight > userWeight) return null;
						return <NavItem key={item.to} {...item} collapsed={collapsed} />;
					})}
				</nav>

				<Separator />

				{/* Dark mode toggle */}
				<div
					className={cn(
						'flex items-center py-3 gap-2',
						collapsed ? 'justify-center px-2' : 'px-4',
					)}
				>
					{collapsed ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type='button'
									onClick={toggleDarkMode}
									className='flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors'
								>
									{darkMode ? (
										<Sun className='h-4 w-4' />
									) : (
										<Moon className='h-4 w-4' />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side='right'>
								{darkMode ? 'Light mode' : 'Dark mode'}
							</TooltipContent>
						</Tooltip>
					) : (
						<>
							<span className='text-xs text-muted-foreground flex-1'>
								{darkMode ? (
									<span className='flex items-center gap-1.5'>
										<Sun className='h-3 w-3' /> Light mode
									</span>
								) : (
									<span className='flex items-center gap-1.5'>
										<Moon className='h-3 w-3' /> Dark mode
									</span>
								)}
							</span>
							<Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
						</>
					)}
				</div>

				<Separator />

				{/* User info */}
				<div
					className={cn(
						'flex items-center gap-3 py-3',
						collapsed ? 'justify-center px-2' : 'px-4',
					)}
				>
					<div className='w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0'>
						{initials}
					</div>
					{!collapsed && (
						<div className='min-w-0 flex-1'>
							<p className='text-xs font-medium truncate'>
								{user?.name || user?.email}
							</p>
							{role && (
								<p className='text-xs text-muted-foreground capitalize'>
									{role}
								</p>
							)}
						</div>
					)}
				</div>
			</div>
		</TooltipProvider>
	);
}

export function Sidebar() {
	const collapsed = useUiStore(s => s.sidebarCollapsed);

	return (
		<aside
			className={cn(
				'bg-card border-r flex flex-col shrink-0 transition-all duration-200 hidden lg:flex',
				collapsed ? 'w-16' : 'w-60',
			)}
		>
			<SidebarInner collapsed={collapsed} />
		</aside>
	);
}
