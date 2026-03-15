import React from 'react';
import { Link, useLocation } from '@/router/compat';
import { Github, Cloud, Menu, X } from 'lucide-react';
import { useDashboardStore } from '@/store/useDashboardStore';
import {
	navSections,
	primaryNavigation,
	type SidebarNavItem,
} from '@/components/navigation/sidebar-config';
import { cn } from '@/lib/utils';

interface LayoutProps {
	children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
	const location = useLocation();
	const [sidebarOpen, setSidebarOpen] = React.useState(false);
	const { githubAuthenticated, googleDriveAuthenticated, stats } =
		useDashboardStore();

	const isActive = (href: string) => {
		const pathname =
			typeof location.pathname === 'string'
				? location.pathname
				: location.pathname == null
					? ''
					: String(location.pathname);
		const normalizedHref = typeof href === 'string' ? href : String(href);

		if (href === '/') {
			return pathname === '/';
		}
		return pathname.startsWith(normalizedHref);
	};

	const navItemClass = (href: string) =>
		cn(
			'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200',
			isActive(href)
				? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 border-r-2 border-primary-700'
				: 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white',
		);

	const renderNavItems = (items: SidebarNavItem[]) => (
		<div className='mt-2 space-y-1'>
			{items.map(item => {
				const Icon = item.icon;
				return (
					<Link
						key={item.name}
						to={item.href}
						className={navItemClass(item.href)}
						onClick={() => setSidebarOpen(false)}
					>
						<Icon className='w-5 h-5 mr-3' />
						{item.name}
					</Link>
				);
			})}
		</div>
	);

	return (
		<div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
			{/* Mobile sidebar backdrop */}
			{sidebarOpen && (
				<div
					className='fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden'
					onClick={() => setSidebarOpen(false)}
				/>
			)}

			{/* Sidebar */}
			<div
				className={cn(
					'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0',
					sidebarOpen ? 'translate-x-0' : '-translate-x-full',
				)}
			>
				<div className='flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-gray-700'>
					<div className='flex items-center'>
						<h1 className='text-xl font-bold text-gray-900 dark:text-white'>
							Bedrock Forge
						</h1>
					</div>
					<button className='lg:hidden' onClick={() => setSidebarOpen(false)}>
						<X className='w-5 h-5 text-gray-500' />
					</button>
				</div>

				<nav
					className='mt-6 px-3 overflow-y-auto flex-1'
					style={{ maxHeight: 'calc(100vh - 5rem)' }}
				>
					<div className='space-y-1'>
						{primaryNavigation.map(item => {
							const Icon = item.icon;
							return (
								<Link
									key={item.name}
									to={item.href}
									className={navItemClass(item.href)}
									onClick={() => setSidebarOpen(false)}
								>
									<Icon className='w-5 h-5 mr-3' />
									{item.name}
								</Link>
							);
						})}
					</div>

					{navSections.map(section => (
						<div
							key={section.title}
							className='mt-8 pt-6 border-t border-gray-200 dark:border-gray-700'
						>
							<h3 className='px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
								{section.title}
							</h3>
							{renderNavItems(section.items)}
						</div>
					))}

					{/* Integration Status */}
					<div className='mt-8 pt-6 border-t border-gray-200 dark:border-gray-700'>
						<h3 className='px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
							Integrations
						</h3>
						<div className='mt-3 space-y-2'>
							<div className='flex items-center px-3 py-2'>
								<Github className='w-4 h-4 mr-2 dark:text-gray-400' />
								<span className='text-sm text-gray-600 dark:text-gray-300'>
									GitHub
								</span>
								<div
									className={`ml-auto w-2 h-2 rounded-full ${
										githubAuthenticated
											? 'bg-green-500'
											: 'bg-gray-300 dark:bg-gray-600'
									}`}
								/>
							</div>
							<div className='flex items-center px-3 py-2'>
								<Cloud className='w-4 h-4 mr-2 dark:text-gray-400' />
								<span className='text-sm text-gray-600 dark:text-gray-300'>
									Google Drive
								</span>
								<div
									className={`ml-auto w-2 h-2 rounded-full ${
										googleDriveAuthenticated
											? 'bg-green-500'
											: 'bg-gray-300 dark:bg-gray-600'
									}`}
								/>
							</div>
						</div>
					</div>
				</nav>
			</div>

			{/* Main content */}
			<div className='lg:pl-64'>
				{/* Top bar */}
				<div className='sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700'>
					<div className='flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8'>
						<button className='lg:hidden' onClick={() => setSidebarOpen(true)}>
							<Menu className='w-6 h-6 text-gray-500' />
						</button>

						<div className='flex items-center space-x-4'>
							{stats && (
								<div className='hidden sm:flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400'>
									<span>{stats.total_projects} projects</span>
									<span>{stats.active_projects} active</span>
									<span>{stats.healthy_sites} healthy</span>
								</div>
							)}
						</div>

						<div className='flex items-center space-x-4'>
							{/* Add user menu, notifications etc. here */}
						</div>
					</div>
				</div>

				{/* Page content */}
				<main className='p-4 sm:p-6 lg:p-8'>{children}</main>
			</div>
		</div>
	);
};

export default Layout;
