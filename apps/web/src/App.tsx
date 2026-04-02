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
const MonitorsPage = lazy(() =>
	import('@/pages/MonitorsPage').then(m => ({ default: m.MonitorsPage })),
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

import React, { Component } from 'react';

class ErrorBoundary extends Component<React.PropsWithChildren> {
	state = { hasError: false };
	static getDerivedStateFromError() {
		return { hasError: true };
	}
	render() {
		if (this.state.hasError) {
			return (
				<div className='flex h-screen items-center justify-center text-center p-8'>
					<div>
						<h2 className='text-xl font-semibold mb-2'>Something went wrong</h2>
						<button
							className='text-sm underline'
							onClick={() => window.location.reload()}
						>
							Reload
						</button>
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
							<Route path='servers' element={<ServersPage />} />
							<Route path='projects' element={<ProjectsPage />} />
							<Route path='projects/:id' element={<ProjectDetailPage />} />
							<Route path='backups' element={<BackupsPage />} />
							<Route path='monitors' element={<MonitorsPage />} />
							<Route path='activity' element={<ActivityPage />} />
							<Route path='settings' element={<SettingsPage />} />{' '}
							<Route
								path='users'
								element={
									<AdminRoute>
										<UsersPage />
									</AdminRoute>
								}
							/>
							<Route path='packages' element={<PackagesPage />} />
							<Route path='invoices' element={<InvoicesPage />} />
							<Route
								path='notifications'
								element={<NotificationsPage />}
							/>{' '}
							<Route path='*' element={<Navigate to='/dashboard' replace />} />
						</Route>
					</Routes>
				</Suspense>
			</BrowserRouter>
		</ErrorBoundary>
	);
}
