import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OverviewData } from '../types';
import { ScoreRing, SummaryBadges } from '../components';
import { SecurityScoreGauge } from '../components/SecurityScoreGauge';
import { SecurityTrendChart } from '../components/SecurityTrendChart';

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
			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				<Card className='lg:col-span-1 overflow-hidden'>
					<CardContent className='p-6 flex flex-col items-center justify-center min-h-[240px] bg-gradient-to-br from-card to-accent/10'>
						<SecurityScoreGauge score={totals.global_score ?? 0} size={240} />
					</CardContent>
				</Card>

				<div className='lg:col-span-2 grid grid-cols-2 gap-4'>
					<Card className='bg-card/50'>
						<CardContent className='p-6'>
							<p className='text-sm font-medium text-muted-foreground'>
								Servers Scanned
							</p>
							<div className='flex items-baseline gap-2 mt-2'>
								<p className='text-3xl font-bold tracking-tight'>
									{totals.servers_scanned}
								</p>
								<p className='text-xs text-muted-foreground'>Total infra</p>
							</div>
						</CardContent>
					</Card>
					<Card className='bg-card/50'>
						<CardContent className='p-6'>
							<p className='text-sm font-medium text-muted-foreground'>
								Websites Scanned
							</p>
							<div className='flex items-baseline gap-2 mt-2'>
								<p className='text-3xl font-bold tracking-tight'>
									{totals.environments_scanned}
								</p>
								<p className='text-xs text-muted-foreground'>WP Envs</p>
							</div>
						</CardContent>
					</Card>
					<Card className='border-red-200/50 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/10'>
						<CardContent className='p-6'>
							<p className='text-sm font-medium text-red-800 dark:text-red-300'>
								Critical Threats
							</p>
							<p className='text-3xl font-bold mt-2 text-red-600 dark:text-red-400 tracking-tight'>
								{totals.critical}
							</p>
						</CardContent>
					</Card>
					<Card className='border-orange-200/50 dark:border-orange-900/50 bg-orange-50/30 dark:bg-orange-900/10'>
						<CardContent className='p-6'>
							<p className='text-sm font-medium text-orange-800 dark:text-orange-300'>
								High Risk Findings
							</p>
							<p className='text-3xl font-bold mt-2 text-orange-500 tracking-tight'>
								{totals.high}
							</p>
						</CardContent>
					</Card>
				</div>
			</div>

			<SecurityTrendChart data={data.history} />

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
