import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ClientsPage } from '@/pages/ClientsPage';
import { ServersPage } from '@/pages/ServersPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { BackupsPage } from '@/pages/BackupsPage';
import { MonitorsPage } from '@/pages/MonitorsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { UsersPage } from '@/pages/UsersPage';
import { PackagesPage } from '@/pages/PackagesPage';
import { InvoicesPage } from '@/pages/InvoicesPage';
import { NotificationsPage } from '@/pages/NotificationsPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
	const token = useAuthStore(s => s.accessToken);
	return token ? <>{children}</> : <Navigate to='/login' replace />;
}

export default function App() {
	return (
		<BrowserRouter>
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
					<Route path='users' element={<UsersPage />} />
					<Route path='packages' element={<PackagesPage />} />
					<Route path='invoices' element={<InvoicesPage />} />
					<Route path='notifications' element={<NotificationsPage />} />{' '}
				</Route>
			</Routes>
		</BrowserRouter>
	);
}
