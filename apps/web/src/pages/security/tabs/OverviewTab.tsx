import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OverviewData } from '../types';
import { ScoreRing, SummaryBadges } from '../components';

export function OverviewTab({ data }: { data: OverviewData }) {
	const { totals } = data;
	const topServers = [...data.servers]
		.filter(s => s.last_scanned_at)
		.sort((a, b) => {
			const aCrit = a.findings_summary.critical + a.findings_summary.high;
			const bCrit = b.findings_summary.critical + b.findings_summary.high;
			return bCrit - aCrit;
		})
		.slice(0, 3);

	return (
		<div className='space-y-6'>
			<div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
				<Card>
					<CardContent className='p-4'>
						<p className='text-xs text-muted-foreground'>Servers scanned</p>
						<p className='text-2xl font-bold mt-1'>{totals.servers_scanned}</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='p-4'>
						<p className='text-xs text-muted-foreground'>
							Environments scanned
						</p>
						<p className='text-2xl font-bold mt-1'>
							{totals.environments_scanned}
						</p>
					</CardContent>
				</Card>
				<Card className='border-red-200 dark:border-red-900'>
					<CardContent className='p-4'>
						<p className='text-xs text-muted-foreground'>Critical findings</p>
						<p className='text-2xl font-bold mt-1 text-red-600 dark:text-red-400'>
							{totals.critical}
						</p>
					</CardContent>
				</Card>
				<Card className='border-orange-200 dark:border-orange-900'>
					<CardContent className='p-4'>
						<p className='text-xs text-muted-foreground'>High findings</p>
						<p className='text-2xl font-bold mt-1 text-orange-500'>
							{totals.high}
						</p>
					</CardContent>
				</Card>
			</div>

			{topServers.length > 0 && (
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm font-semibold'>
							Servers needing attention
						</CardTitle>
					</CardHeader>
					<CardContent className='p-0'>
						<div className='divide-y'>
							{topServers.map(s => (
								<div key={s.id} className='flex items-center gap-4 px-4 py-3'>
									<ScoreRing score={s.score} />
									<div className='flex-1 min-w-0'>
										<p className='font-medium text-sm'>{s.name}</p>
										<p className='text-xs text-muted-foreground'>
											{s.ip_address}
										</p>
									</div>
									<SummaryBadges summary={s.findings_summary} />
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{data.servers.length === 0 && (
				<div className='text-center py-16 text-muted-foreground'>
					<ShieldAlert className='h-12 w-12 mx-auto mb-3 opacity-30' />
					<p className='font-medium'>No scans run yet</p>
					<p className='text-sm mt-1'>
						Switch to the Server Security tab and run your first scan.
					</p>
				</div>
			)}
		</div>
	);
}
