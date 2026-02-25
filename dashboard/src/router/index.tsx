import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
} from '@tanstack/react-router';
import { useEffect } from 'react';

import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import CreateProjectWizard from '@/pages/CreateProjectWizard';
import ProjectDetail from '@/pages/ProjectDetail';
import Clients from '@/pages/Clients';
import Backups from '@/pages/Backups';
import Migrations from '@/pages/Migrations';
import Settings from '@/pages/Settings';
import Servers from '@/pages/Servers';
import ServerDetail from '@/pages/ServerDetail';
import Monitoring from '@/pages/Monitoring';
import Analytics from '@/pages/Analytics';
import Subscriptions from '@/pages/Subscriptions';
import Packages from '@/pages/Packages';
import Invoices from '@/pages/Invoices';
import Domains from '@/pages/Domains';
import SSL from '@/pages/SSL';
import ClientDetail from '@/pages/ClientDetail';
import AuditLogs from '@/pages/AuditLogs';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ClientPortal from '@/pages/ClientPortal';
import StatusPage from '@/pages/StatusPage';
import Deployments from '@/pages/Deployments';
import Schedules from '@/pages/Schedules';
import Users from '@/pages/Users';
import Roles from '@/pages/Roles';
import Tags from '@/pages/Tags';
import { useAuthStore } from '@/store/authStore';

function RootComponent() {
	const { accessToken, fetchUser, user } = useAuthStore();

	useEffect(() => {
		if (accessToken && !user) {
			fetchUser();
		}
	}, [accessToken, user, fetchUser]);

	return <Outlet />;
}

function ProtectedShell() {
	return (
		<ProtectedRoute>
			<Layout>
				<Outlet />
			</Layout>
		</ProtectedRoute>
	);
}

const rootRoute = createRootRoute({
	component: RootComponent,
});

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/login',
	component: Login,
});

const registerRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/register',
	component: Register,
});

const portalRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/portal',
	component: ClientPortal,
});

const statusRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/status',
	component: StatusPage,
});

const statusByProjectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/status/$projectId',
	component: StatusPage,
});

const protectedRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: 'protected-layout',
	component: ProtectedShell,
});

const dashboardRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/',
	component: Dashboard,
});

const projectsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/projects',
	component: Projects,
});

const createProjectRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/projects/new',
	component: CreateProjectWizard,
});

const projectDetailRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/projects/$projectName',
	component: ProjectDetail,
});

const serversRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/servers',
	component: Servers,
});

const serverDetailRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/servers/$serverId',
	component: ServerDetail,
});

const monitoringRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/monitoring',
	component: Monitoring,
});

const analyticsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/analytics',
	component: Analytics,
});

const clientsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/clients',
	component: Clients,
});

const clientDetailRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/clients/$clientId',
	component: ClientDetail,
});

const backupsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/backups',
	component: Backups,
});

const migrationsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/migrations',
	component: Migrations,
});

const auditLogsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/audit-logs',
	component: AuditLogs,
});

const deploymentsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/deployments',
	component: Deployments,
});

const schedulesRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/schedules',
	component: Schedules,
});

const invoicesRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/billing/invoices',
	component: Invoices,
});

const subscriptionsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/billing/subscriptions',
	component: Subscriptions,
});

const packagesRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/billing/packages',
	component: Packages,
});

const domainsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/assets/domains',
	component: Domains,
});

const sslRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/assets/ssl',
	component: SSL,
});

const usersRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/users',
	component: Users,
});

const rolesRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/roles',
	component: Roles,
});

const tagsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/tags',
	component: Tags,
});

const settingsRoute = createRoute({
	getParentRoute: () => protectedRoute,
	path: '/settings',
	component: Settings,
});

const routeTree = rootRoute.addChildren([
	loginRoute,
	registerRoute,
	portalRoute,
	statusRoute,
	statusByProjectRoute,
	protectedRoute.addChildren([
		dashboardRoute,
		projectsRoute,
		createProjectRoute,
		projectDetailRoute,
		serversRoute,
		serverDetailRoute,
		monitoringRoute,
		analyticsRoute,
		invoicesRoute,
		subscriptionsRoute,
		packagesRoute,
		domainsRoute,
		sslRoute,
		clientsRoute,
		clientDetailRoute,
		backupsRoute,
		migrationsRoute,
		auditLogsRoute,
		deploymentsRoute,
		schedulesRoute,
		usersRoute,
		rolesRoute,
		tagsRoute,
		settingsRoute,
	]),
]);

export const router = createRouter({
	routeTree,
} as any);

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
