import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import type { SessionItem } from '../types';

export function SessionsTab() {
	const queryClient = useQueryClient();

	const { data: sessions, isLoading } = useQuery<SessionItem[]>({
		queryKey: ['auth', 'sessions'],
		queryFn: () => api.get('/auth/sessions'),
		refetchInterval: 60_000,
	});

	const revokeMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/auth/sessions/${id}`),
		onSuccess: () => {
			toast({ title: 'Session revoked' });
			void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
		},
		onError: () =>
			toast({ title: 'Failed to revoke session', variant: 'destructive' }),
	});

	const logoutAllMutation = useMutation({
		mutationFn: () => api.post('/auth/logout-all', {}),
		onSuccess: () => {
			toast({ title: 'All sessions signed out' });
			void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
		},
		onError: () =>
			toast({
				title: 'Failed to sign out all devices',
				variant: 'destructive',
			}),
	});

	const parseUa = (ua: string | null) => {
		if (!ua) return 'Unknown device';
		const chrome = /Chrome\/([\.\d]+)/.exec(ua);
		if (chrome && !ua.includes('Edg') && !ua.includes('OPR'))
			return `Chrome ${chrome[1]}`;
		const firefox = /Firefox\/([\.\d]+)/.exec(ua);
		if (firefox) return `Firefox ${firefox[1]}`;
		const edge = /Edg\/([\.\d]+)/.exec(ua);
		if (edge) return `Edge ${edge[1]}`;
		if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
		return ua.slice(0, 60);
	};

	return (
		<div className='space-y-4 max-w-2xl'>
			<div className='flex items-start justify-between gap-4'>
				<p className='text-sm text-muted-foreground'>
					Active sessions authenticated to your account. Revoking a session
					signs that device out immediately.
				</p>
				<Button
					variant='destructive'
					size='sm'
					className='shrink-0'
					onClick={() => logoutAllMutation.mutate()}
					disabled={logoutAllMutation.isPending}
				>
					Sign out all devices
				</Button>
			</div>
			<div className='border rounded-md overflow-hidden'>
				{isLoading ? (
					<div className='flex justify-center py-8'>
						<RefreshCw className='h-5 w-5 animate-spin text-muted-foreground' />
					</div>
				) : (
					<table className='w-full text-sm'>
						<thead>
							<tr className='border-b bg-muted/50'>
								<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
									Device / Browser
								</th>
								<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell'>
									IP Address
								</th>
								<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden md:table-cell'>
									Created
								</th>
								<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden md:table-cell'>
									Expires
								</th>
								<th className='px-3 py-2 w-20' />
							</tr>
						</thead>
						<tbody className='divide-y'>
							{!sessions?.length && (
								<tr>
									<td
										colSpan={5}
										className='text-center py-8 text-muted-foreground text-xs'
									>
										No active sessions.
									</td>
								</tr>
							)}
							{sessions?.map(s => (
								<tr key={s.id} className='hover:bg-muted/30'>
									<td className='px-3 py-2'>
										<p className='text-xs'>{parseUa(s.user_agent)}</p>
									</td>
									<td className='px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell font-mono'>
										{s.ip_address ?? '—'}
									</td>
									<td className='px-3 py-2 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap'>
										{new Date(s.created_at).toLocaleString()}
									</td>
									<td className='px-3 py-2 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap'>
										{new Date(s.expires_at).toLocaleString()}
									</td>
									<td className='px-3 py-2 text-right'>
										<Button
											variant='ghost'
											size='sm'
											className='h-7 px-2 text-xs text-destructive hover:text-destructive'
											onClick={() => revokeMutation.mutate(s.id)}
											disabled={
												revokeMutation.isPending &&
												revokeMutation.variables === s.id
											}
										>
											Revoke
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
