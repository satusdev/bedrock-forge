import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
	return (
		<div className='flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4'>
			<div className='space-y-2'>
				<h1 className='text-7xl font-bold text-muted-foreground/40'>404</h1>
				<h2 className='text-2xl font-semibold'>Page not found</h2>
				<p className='text-muted-foreground max-w-sm'>
					The page you're looking for doesn't exist or has been moved.
				</p>
			</div>
			<Button asChild>
				<Link to='/dashboard'>Go to Dashboard</Link>
			</Button>
		</div>
	);
}
