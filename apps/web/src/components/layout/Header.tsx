import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api-client';

export function Header() {
	const { user, logout } = useAuthStore();

	const handleLogout = async () => {
		try {
			await api.post('/auth/logout', {});
		} catch {
			/* ignore */
		}
		logout();
	};

	return (
		<header className='h-14 border-b flex items-center justify-between px-6 bg-card shrink-0'>
			<div />
			<div className='flex items-center gap-4'>
				<span className='text-sm text-muted-foreground'>{user?.email}</span>
				<button
					onClick={handleLogout}
					className='text-sm text-muted-foreground hover:text-foreground transition-colors'
				>
					Sign out
				</button>
			</div>
		</header>
	);
}
