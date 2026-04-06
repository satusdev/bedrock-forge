import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from '@/components/CommandPalette';

export function AppLayout() {
	const [cmdOpen, setCmdOpen] = useState(false);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				setCmdOpen(v => !v);
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, []);

	return (
		<div className='flex h-screen bg-background overflow-hidden'>
			<Sidebar />
			<div className='flex flex-col flex-1 overflow-hidden'>
				<Header onOpenSearch={() => setCmdOpen(true)} />
				<main className='flex-1 overflow-y-auto p-6'>
					<Outlet />
				</main>
			</div>
			<CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
		</div>
	);
}
