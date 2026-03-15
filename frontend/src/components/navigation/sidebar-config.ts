import {
	Activity,
	ArrowLeftRight,
	BarChart3,
	FileText,
	FolderKanban,
	Globe,
	HardDrive,
	LayoutDashboard,
	Package,
	Server,
	Settings,
	Shield,
	ShieldCheck,
	Tag,
	Users,
} from 'lucide-react';
import type React from 'react';

export type SidebarNavItem = {
	name: string;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
};

export type SidebarNavSection = {
	title: string;
	items: SidebarNavItem[];
};

export const primaryNavigation: SidebarNavItem[] = [
	{ name: 'Dashboard', href: '/', icon: LayoutDashboard },
	{ name: 'Projects', href: '/projects', icon: FolderKanban },
	{ name: 'Migrations', href: '/migrations', icon: ArrowLeftRight },
	{ name: 'Backups', href: '/backups', icon: HardDrive },
];

export const navSections: SidebarNavSection[] = [
	{
		title: 'Operations',
		items: [
			{ name: 'Servers', href: '/servers', icon: Server },
			{ name: 'Monitoring', href: '/monitoring', icon: Activity },
			{ name: 'Analytics', href: '/analytics', icon: BarChart3 },
			{ name: 'Clients', href: '/clients', icon: Users },
			{ name: 'Audit Logs', href: '/audit-logs', icon: Shield },
			{ name: 'Settings', href: '/settings', icon: Settings },
		],
	},
	{
		title: 'Billing',
		items: [
			{ name: 'Invoices', href: '/billing/invoices', icon: FileText },
			{ name: 'Subscriptions', href: '/billing/subscriptions', icon: Users },
			{ name: 'Packages', href: '/billing/packages', icon: Package },
		],
	},
	{
		title: 'Assets',
		items: [
			{ name: 'Domains', href: '/assets/domains', icon: Globe },
			{ name: 'SSL Certs', href: '/assets/ssl', icon: ShieldCheck },
		],
	},
	{
		title: 'Administration',
		items: [
			{ name: 'Users', href: '/users', icon: Users },
			{ name: 'Roles', href: '/roles', icon: Shield },
			{ name: 'Tags', href: '/tags', icon: Tag },
		],
	},
];
