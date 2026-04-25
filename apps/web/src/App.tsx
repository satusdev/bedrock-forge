import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { destroySocket } from '@/lib/websocket';
import { AppLayout } from '@/components/layout/AppLayout';

// Lazy-load all page bundles — each becomes a separate chunk
const LoginPage = lazy(() =>
	import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })),
);
const DashboardPage = lazy(() =>
	import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })),
);
const ClientsPage = lazy(() =>
	import('@/pages/ClientsPage').then(m => ({ default: m.ClientsPage })),
);
const ClientDetailPage = lazy(() =>
	import('@/pages/ClientDetailPage').then(m => ({
		default: m.ClientDetailPage,
	})),
);
const ServersPage = lazy(() =>
	import('@/pages/ServersPage').then(m => ({ default: m.ServersPage })),
);
const ProjectsPage = lazy(() =>
	import('@/pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })),
);
const ProjectDetailPage = lazy(() =>
	import('@/pages/ProjectDetailPage').then(m => ({
		default: m.ProjectDetailPage,
	})),
);
const BackupsPage = lazy(() =>
	import('@/pages/BackupsPage').then(m => ({ default: m.BackupsPage })),
);
const DomainsPage = lazy(() =>
	import('@/pages/DomainsPage').then(m => ({ default: m.DomainsPage })),
);
const MonitorsPage = lazy(() =>
	import('@/pages/MonitorsPage').then(m => ({ default: m.MonitorsPage })),
);
const MonitorDetailPage = lazy(() =>
	import('@/pages/MonitorDetailPage').then(m => ({
		default: m.MonitorDetailPage,
	})),
);
const SettingsPage = lazy(() =>
	import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })),
);
const ActivityPage = lazy(() =>
	import('@/pages/ActivityPage').then(m => ({ default: m.ActivityPage })),
);
const UsersPage = lazy(() =>
	import('@/pages/UsersPage').then(m => ({ default: m.UsersPage })),
);
const PackagesPage = lazy(() =>
	import('@/pages/PackagesPage').then(m => ({ default: m.PackagesPage })),
);
const InvoicesPage = lazy(() =>
	import('@/pages/InvoicesPage').then(m => ({ default: m.InvoicesPage })),
);
const NotificationsPage = lazy(() =>
	import('@/pages/NotificationsPage').then(m => ({
		default: m.NotificationsPage,
	})),
);
const ReportsPage = lazy(() =>
	import('@/pages/ReportsPage').then(m => ({ default: m.ReportsPage })),
);
const ProblemsPage = lazy(() =>
	import('@/pages/ProblemsPage').then(m => ({ default: m.ProblemsPage })),
);
const AuditLogsPage = lazy(() =>
	import('@/pages/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })),
);
const NotFoundPage = lazy(() =>
	import('@/pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })),
);

import React, { Component } from 'react';

class ErrorBoundary extends Component<
	React.PropsWithChildren,
	{ hasError: boolean; error: Error | null }
> {
	state = { hasError: false, error: null };
	static getDerivedStateFromError(error: Error) {
		return { hasError: true, error };
	}
	render() {
		if (this.state.hasError) {
			return (
				<div className='flex h-screen items-center justify-center text-center p-8'>
					<div className='max-w-lg'>
						<h2 className='text-xl font-semibold mb-2'>Something went wrong</h2>
						{import.meta.env.DEV && this.state.error && (
							<pre className='text-left text-xs bg-muted p-4 rounded mb-4 overflow-auto max-h-64'>
								{(this.state.error as Error).message}\n
								{(this.state.error as Error).stack}
							</pre>
						)}
						<div className='flex gap-3 justify-center'>
							<button
								className='text-sm underline'
								onClick={() => window.location.reload()}
							>
								Reload
							</button>
							<a href='/dashboard' className='text-sm underline'>
								Go to Dashboard
							</a>
						</div>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
	const token = useAuthStore(s => s.accessToken);
	return token ? <>{children}</> : <Navigate to='/login' replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
	const user = useAuthStore(s => s.user);
	if (!user) return <Navigate to='/login' replace />;
	return user.roles.includes('admin') ? (
		<>{children}</>
	) : (
		<Navigate to='/dashboard' replace />
	);
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
	const user = useAuthStore(s => s.user);
	if (!user) return <Navigate to='/login' replace />;
	return user.roles.includes('admin') || user.roles.includes('manager') ? (
		<>{children}</>
	) : (
		<Navigate to='/dashboard' replace />
	);
}

export default function App() {
	// Disconnect WebSocket when the user logs out
	useEffect(() => {
		return useAuthStore.subscribe((state, prev) => {
			if (!state.accessToken && prev.accessToken) {
				destroySocket();
			}
		});
	}, []);

	return (
		<ErrorBoundary>
			<BrowserRouter>
				<Suspense
					fallback={
						<div className='flex h-screen items-center justify-center'>
							<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary' />
						</div>
					}
				>
					<Routes>
						<Route path='/login' element={<LoginPage />} />
						<Route
							path='/'
							element={
								<PrivateRoute>
									<AppLayout />
								</PrivateRoute>
							}
						>
							<Route index element={<Navigate to='/dashboard' replace />} />
							<Route path='dashboard' element={<DashboardPage />} />
							<Route path='clients' element={<ClientsPage />} />
							<Route path='clients/:id' element={<ClientDetailPage />} />
							<Route path='servers' element={<ServersPage />} />
							<Route path='projects' element={<ProjectsPage />} />
							<Route path='projects/:id' element={<ProjectDetailPage />} />
							<Route path='backups' element={<BackupsPage />} />
							<Route path='monitors' element={<MonitorsPage />} />
							<Route path='monitors/:id' element={<MonitorDetailPage />} />
							<Route path='activity' element={<ActivityPage />} />
							<Route path='problems' element={<ProblemsPage />} />
							<Route path='settings' element={<SettingsPage />} />{' '}
							<Route
								path='users'
								element={
									<AdminRoute>
										<UsersPage />
									</AdminRoute>
								}
							/>
							<Route
								path='packages'
								element={
									<ManagerRoute>
										<PackagesPage />
									</ManagerRoute>
								}
							/>
							<Route
								path='invoices'
								element={
									<ManagerRoute>
										<InvoicesPage />
									</ManagerRoute>
								}
							/>
							<Route
								path='notifications'
								element={
									<AdminRoute>
										<NotificationsPage />
									</AdminRoute>
								}
							/>
							<Route
								path='reports'
								element={
									<AdminRoute>
										<ReportsPage />
									</AdminRoute>
								}
							/>
							<Route path='domains' element={<DomainsPage />} />
							<Route
								path='audit-logs'
								element={
									<AdminRoute>
										<AuditLogsPage />
									</AdminRoute>
								}
							/>{' '}
							<Route path='*' element={<NotFoundPage />} />
						</Route>
					</Routes>
				</Suspense>
			</BrowserRouter>
		</ErrorBoundary>
	);
}
