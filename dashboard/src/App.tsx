import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import CreateProjectWizard from './pages/CreateProjectWizard';
import ProjectDetail from './pages/ProjectDetail';
import Clients from './pages/Clients';
import Backups from './pages/Backups';
import Settings from './pages/Settings';
import Servers from './pages/Servers';
import ServerDetail from './pages/ServerDetail';
import Monitoring from './pages/Monitoring';
import Subscriptions from './pages/Subscriptions';
import Packages from './pages/Packages';
import Domains from './pages/Domains';
import SSL from './pages/SSL';
import ClientDetail from './pages/ClientDetail';
import AuditLogs from './pages/AuditLogs';
import Login from './pages/Login';
import Register from './pages/Register';
import Deployments from './pages/Deployments';
import Schedules from './pages/Schedules';
import Users from './pages/Users';
import Roles from './pages/Roles';
import Tags from './pages/Tags';
import { useAuthStore } from './store/authStore';

function App() {
	const { accessToken, fetchUser, user } = useAuthStore();

	// Auto-fetch user on app load if we have a token
	useEffect(() => {
		if (accessToken && !user) {
			fetchUser();
		}
	}, [accessToken, user, fetchUser]);

	return (
		<Routes>
			{/* Public routes */}
			<Route path='/login' element={<Login />} />
			<Route path='/register' element={<Register />} />

			{/* Protected routes */}
			<Route
				path='/*'
				element={
					<ProtectedRoute>
						<Layout>
							<Routes>
								<Route path='/' element={<Dashboard />} />
								<Route path='/projects' element={<Projects />} />
								<Route path='/projects/new' element={<CreateProjectWizard />} />
								<Route
									path='/projects/:projectName'
									element={<ProjectDetail />}
								/>
								<Route path='/servers' element={<Servers />} />
								<Route path='/servers/:serverId' element={<ServerDetail />} />
								<Route path='/monitoring' element={<Monitoring />} />

								{/* Billing & Assets */}
								<Route
									path='/billing/subscriptions'
									element={<Subscriptions />}
								/>
								<Route path='/billing/packages' element={<Packages />} />
								<Route path='/assets/domains' element={<Domains />} />
								<Route path='/assets/ssl' element={<SSL />} />

								<Route path='/clients' element={<Clients />} />
								<Route path='/clients/:clientId' element={<ClientDetail />} />
								<Route path='/backups' element={<Backups />} />
								<Route path='/audit-logs' element={<AuditLogs />} />
								<Route path='/deployments' element={<Deployments />} />
								<Route path='/schedules' element={<Schedules />} />

								{/* User Management */}
								<Route path='/users' element={<Users />} />
								<Route path='/roles' element={<Roles />} />
								<Route path='/tags' element={<Tags />} />

								<Route path='/settings' element={<Settings />} />
							</Routes>
						</Layout>
					</ProtectedRoute>
				}
			/>
		</Routes>
	);
}

export default App;
