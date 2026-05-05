import React, { useState } from 'react';
import { RefreshCw, ServerIcon, Lock, Clock, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { OverviewData } from '../types';
import { ScoreRing, SummaryBadges } from '../components';
import { ServerScanHistory } from '../scan-history';
import { HardenDialog, ScanDialog } from '../dialogs';
import { ServerSchedulesTab } from './ScheduleTabs';

export function ServerSecurityTab({ data }: { data: OverviewData }) {
	const [scanDialog, setScanDialog] = useState<{
		open: boolean;
		serverId: number;
		serverName: string;
	} | null>(null);
	const [hardenDialog, setHardenDialog] = useState<{
		open: boolean;
		serverId: number;
		serverName: string;
		initialActions?: string[];
	} | null>(null);
	const [expandedId, setExpandedId] = useState<number | null>(null);
	const [showSchedules, setShowSchedules] = useState(false);

	return (
		<div className='space-y-3'>
			{data.servers.map(server => {
				const isExpanded = expandedId === server.id;
				const hasFindings =
					server.findings_summary.critical +
						server.findings_summary.high +
						server.findings_summary.medium +
						server.findings_summary.low >
					0;

				return (
					<Card key={server.id}>
						<CardContent className='p-4'>
							<div className='flex items-center gap-4'>
								<ScoreRing score={server.score} />
								<div className='flex-1 min-w-0'>
									<div className='flex items-center gap-2'>
										<p className='font-semibold text-sm'>{server.name}</p>
										<span className='text-xs text-muted-foreground'>
											{server.ip_address}
										</span>
									</div>
									<SummaryBadges summary={server.findings_summary} />
									{server.last_scanned_at && (
										<p className='text-xs text-muted-foreground mt-1'>
											Last scan:{' '}
											{new Date(server.last_scanned_at).toLocaleString()}
										</p>
									)}
								</div>
								<div className='flex gap-2 shrink-0'>
									{hasFindings && (
										<Button
											variant='ghost'
											size='sm'
											onClick={() =>
												setExpandedId(isExpanded ? null : server.id)
											}
										>
											{isExpanded ? 'Hide' : 'View findings'}
										</Button>
									)}
									<Button
										size='sm'
										variant='outline'
										onClick={() =>
											setHardenDialog({
												open: true,
												serverId: server.id,
												serverName: server.name,
											})
										}
									>
										<Lock className='h-3.5 w-3.5 mr-1.5' />
										Harden
									</Button>
									<Button
										size='sm'
										variant='outline'
										onClick={() =>
											setScanDialog({
												open: true,
												serverId: server.id,
												serverName: server.name,
											})
										}
									>
										<RefreshCw className='h-3.5 w-3.5 mr-1.5' />
										Scan
									</Button>
								</div>
							</div>

							{isExpanded && (
								<div className='mt-4 border-t pt-4'>
									<ServerScanHistory serverId={server.id} />
								</div>
							)}
						</CardContent>
					</Card>
				);
			})}

			{data.servers.length === 0 && (
				<div className='text-center py-12 text-muted-foreground'>
					<ServerIcon className='h-10 w-10 mx-auto mb-2 opacity-30' />
					<p>No servers found.</p>
				</div>
			)}

			{scanDialog && (
				<ScanDialog
					open={scanDialog.open}
					onClose={() => setScanDialog(null)}
					targetType='server'
					targetId={scanDialog.serverId}
					targetName={scanDialog.serverName}
				/>
			)}
			{hardenDialog && (
				<HardenDialog
					open={hardenDialog.open}
					onClose={() => setHardenDialog(null)}
					targetType='server'
					targetId={hardenDialog.serverId}
					targetName={hardenDialog.serverName}
					initialActions={hardenDialog.initialActions}
				/>
			)}

			<div className='border rounded-lg bg-card'>
				<button
					type='button'
					className='w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors'
					onClick={() => setShowSchedules(v => !v)}
				>
					<span className='flex items-center gap-2'>
						<Clock className='h-4 w-4' />
						Scan Schedules
					</span>
					<ChevronDown
						className={`h-4 w-4 transition-transform ${showSchedules ? 'rotate-180' : ''}`}
					/>
				</button>
				{showSchedules && (
					<div className='border-t px-4 py-4'>
						<ServerSchedulesTab data={data} />
					</div>
				)}
			</div>
		</div>
	);
}
