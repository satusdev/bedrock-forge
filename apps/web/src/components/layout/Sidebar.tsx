import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
	LayoutDashboard,
	Users,
	Server,
	FolderKanban,
	HardDrive,
	Activity,
	Globe,
	Settings,
} from 'lucide-react';

const navItems = [
	{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
	{ to: '/clients', label: 'Clients', icon: Users },
	{ to: '/servers', label: 'Servers', icon: Server },
	{ to: '/projects', label: 'Projects', icon: FolderKanban },
	{ to: '/backups', label: 'Backups', icon: HardDrive },
	{ to: '/monitors', label: 'Monitors', icon: Activity },
	{ to: '/domains', label: 'Domains', icon: Globe },
	{ to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
	return (
		<aside className='w-60 bg-card border-r flex flex-col shrink-0'>
			{/* Logo */}
			<div className='h-14 flex items-center px-6 border-b'>
				<span className='font-bold text-lg tracking-tight'>
					⚒ Bedrock Forge
				</span>
			</div>

			{/* Nav */}
			<nav className='flex-1 p-3 space-y-1'>
				{navItems.map(({ to, label, icon: Icon }) => (
					<NavLink
						key={to}
						to={to}
						className={({ isActive }) =>
							cn(
								'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
								isActive
									? 'bg-primary text-primary-foreground'
									: 'text-muted-foreground hover:bg-accent hover:text-foreground',
							)
						}
					>
						<Icon className='h-4 w-4' />
						{label}
					</NavLink>
				))}
			</nav>
		</aside>
	);
}
