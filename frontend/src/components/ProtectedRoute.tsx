/**
 * Protected Route Component
 * Wraps routes that require authentication.
 */
import { useAuthStore } from '../store/authStore';
import { useEffect } from 'react';
import { Navigate, useLocation } from '@/router/compat';

interface ProtectedRouteProps {
	children: React.ReactNode;
	requireSuperuser?: boolean;
}

export default function ProtectedRoute({
	children,
	requireSuperuser = false,
}: ProtectedRouteProps) {
	const location = useLocation();
	const { isAuthenticated, user, isLoading, fetchUser, accessToken } =
		useAuthStore();

	// Try to fetch user if we have a token but no user
	useEffect(() => {
		if (accessToken && !user && !isLoading) {
			fetchUser();
		}
	}, [accessToken, user, isLoading, fetchUser]);

	// Show loading state
	if (isLoading) {
		return (
			<div className='min-h-screen flex items-center justify-center bg-gray-900'>
				<div className='text-center'>
					<svg
						className='animate-spin h-12 w-12 text-blue-500 mx-auto mb-4'
						viewBox='0 0 24 24'
					>
						<circle
							className='opacity-25'
							cx='12'
							cy='12'
							r='10'
							stroke='currentColor'
							strokeWidth='4'
							fill='none'
						/>
						<path
							className='opacity-75'
							fill='currentColor'
							d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
						/>
					</svg>
					<p className='text-gray-400'>Loading...</p>
				</div>
			</div>
		);
	}

	// Redirect to login if not authenticated
	if (!isAuthenticated) {
		return <Navigate to='/login' replace />;
	}

	// Check superuser requirement
	if (requireSuperuser && !user?.is_superuser) {
		return (
			<div className='min-h-screen flex items-center justify-center bg-gray-900'>
				<div className='text-center'>
					<div className='text-6xl mb-4'>🔒</div>
					<h1 className='text-2xl font-bold text-white mb-2'>Access Denied</h1>
					<p className='text-gray-400'>
						You need superuser privileges to access this page.
					</p>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
