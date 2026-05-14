import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Clock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import type {
	OverviewData,
	ServerSummary,
	EnvironmentSummary,
	SecuritySchedule,
	ServerSecurityAlertSetting,
} from '../types';
import { ScheduleDialog, ServerAlertDialog } from '../dialogs';

// ─── ServerSchedulesTab ───────────────────────────────────────────────────────

export function ServerSchedulesTab({ data }: { data: OverviewData }) {
	const [dialog, setDialog] = useState<{
		serverId: number;
		serverName: string;
	} | null>(null);
	const [alertDialog, setAlertDialog] = useState<{
		serverId: number;
		serverName: string;
	} | null>(null);

	return (
		<div className='space-y-3'>
			<p className='text-sm text-muted-foreground'>
				Configure automated security scans per server. Schedules are checked
				every 15 minutes.
			</p>
			<div className='border rounded-md overflow-hidden'>
				<table className='w-full text-sm'>
					<thead>
						<tr className='border-b bg-muted/50'>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Server
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell'>
								Last scan
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Schedule
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Alerts
							</th>
							<th className='px-3 py-2 w-8' />
						</tr>
					</thead>
					<tbody className='divide-y'>
						{data.servers.map(server => (
							<ServerScheduleRow
								key={server.id}
								server={server}
								onEdit={() =>
									setDialog({ serverId: server.id, serverName: server.name })
								}
								onEditAlerts={() =>
									setAlertDialog({
										serverId: server.id,
										serverName: server.name,
									})
								}
							/>
						))}
						{data.servers.length === 0 && (
							<tr>
								<td
									colSpan={5}
									className='text-center py-8 text-muted-foreground text-xs'
								>
									No servers found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{dialog && (
				<ScheduleDialog
					open
					onClose={() => setDialog(null)}
					targetType='server'
					targetId={dialog.serverId}
					targetName={dialog.serverName}
				/>
			)}
			{alertDialog && (
				<ServerAlertDialog
					open
					onClose={() => setAlertDialog(null)}
					serverId={alertDialog.serverId}
					serverName={alertDialog.serverName}
				/>
			)}
		</div>
	);
}

function ServerScheduleRow({
	server,
	onEdit,
	onEditAlerts,
}: {
	server: ServerSummary;
	onEdit: () => void;
	onEditAlerts: () => void;
}) {
	const { data: schedule } = useQuery<SecuritySchedule | null>({
		queryKey: ['security', 'schedule', 'server', server.id],
		queryFn: async () => {
			try {
				return await api.get<SecuritySchedule>(
					`/security/schedules/servers/${server.id}`,
				);
			} catch {
				return null;
			}
		},
	});
	const { data: alertSetting } = useQuery<ServerSecurityAlertSetting | null>({
		queryKey: ['security', 'server-alerts', server.id],
		queryFn: async () => {
			try {
				return await api.get<ServerSecurityAlertSetting>(
					`/security/server-alerts/${server.id}`,
				);
			} catch {
				return null;
			}
		},
	});

	return (
		<tr className='hover:bg-muted/30'>
			<td className='px-3 py-2'>
				<p className='font-medium text-sm'>{server.name}</p>
				<p className='text-xs text-muted-foreground'>{server.ip_address}</p>
			</td>
			<td className='px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell'>
				{server.last_scanned_at
					? new Date(server.last_scanned_at).toLocaleString()
					: 'Never'}
			</td>
			<td className='px-3 py-2'>
				{schedule ? (
					<div className='flex items-center gap-2'>
						<Clock className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
						<span className='text-xs'>
							{schedule.frequency.charAt(0).toUpperCase() +
								schedule.frequency.slice(1)}{' '}
							at {String(schedule.hour).padStart(2, '0')}:
							{String(schedule.minute).padStart(2, '0')} UTC
						</span>
						{!schedule.enabled && (
							<Badge variant='outline' className='text-xs px-1 py-0'>
								Disabled
							</Badge>
						)}
					</div>
				) : (
					<span className='text-xs text-muted-foreground'>Not configured</span>
				)}
			</td>
			<td className='px-3 py-2'>
				<Button
					variant='ghost'
					size='sm'
					className='h-7 px-2 gap-1.5'
					onClick={onEditAlerts}
				>
					<Bell className='h-3.5 w-3.5' />
					<span className='text-xs'>
						{alertSetting?.enabled ? 'Enabled' : 'Off'}
					</span>
				</Button>
			</td>
			<td className='px-3 py-2 text-right'>
				<Button variant='ghost' size='sm' className='h-7 px-2' onClick={onEdit}>
					{schedule ? 'Edit' : <Plus className='h-3.5 w-3.5' />}
				</Button>
			</td>
		</tr>
	);
}

// ─── ProjectSchedulesTab ──────────────────────────────────────────────────────

export function ProjectSchedulesTab({ data }: { data: OverviewData }) {
	const [dialog, setDialog] = useState<{
		envId: number;
		envName: string;
	} | null>(null);

	return (
		<div className='space-y-3'>
			<p className='text-sm text-muted-foreground'>
				Configure automated WordPress security scans per environment.
			</p>
			<div className='border rounded-md overflow-hidden'>
				<table className='w-full text-sm'>
					<thead>
						<tr className='border-b bg-muted/50'>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Environment
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell'>
								Last scan
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Schedule
							</th>
							<th className='px-3 py-2 w-8' />
						</tr>
					</thead>
					<tbody className='divide-y'>
						{data.environments.map(env => (
							<EnvironmentScheduleRow
								key={env.id}
								env={env}
								onEdit={() =>
									setDialog({
										envId: env.id,
										envName: `${env.project.name} / ${env.type}`,
									})
								}
							/>
						))}
						{data.environments.length === 0 && (
							<tr>
								<td
									colSpan={4}
									className='text-center py-8 text-muted-foreground text-xs'
								>
									No environments found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{dialog && (
				<ScheduleDialog
					open
					onClose={() => setDialog(null)}
					targetType='environment'
					targetId={dialog.envId}
					targetName={dialog.envName}
				/>
			)}
		</div>
	);
}

function EnvironmentScheduleRow({
	env,
	onEdit,
}: {
	env: EnvironmentSummary;
	onEdit: () => void;
}) {
	const { data: schedule } = useQuery<SecuritySchedule | null>({
		queryKey: ['security', 'schedule', 'environment', env.id],
		queryFn: async () => {
			try {
				return await api.get<SecuritySchedule>(
					`/security/schedules/environments/${env.id}`,
				);
			} catch {
				return null;
			}
		},
	});

	return (
		<tr className='hover:bg-muted/30'>
			<td className='px-3 py-2'>
				<p className='font-medium text-sm'>
					{env.project.name}{' '}
					<Badge variant='outline' className='text-xs ml-1'>
						{env.type}
					</Badge>
				</p>
				<a
					href={env.url}
					target='_blank'
					rel='noreferrer'
					className='text-xs text-muted-foreground hover:underline truncate max-w-xs block'
				>
					{env.url}
				</a>
			</td>
			<td className='px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell'>
				{env.last_scanned_at
					? new Date(env.last_scanned_at).toLocaleString()
					: 'Never'}
			</td>
			<td className='px-3 py-2'>
				{schedule ? (
					<div className='flex items-center gap-2'>
						<Clock className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
						<span className='text-xs'>
							{schedule.frequency.charAt(0).toUpperCase() +
								schedule.frequency.slice(1)}{' '}
							at {String(schedule.hour).padStart(2, '0')}:
							{String(schedule.minute).padStart(2, '0')} UTC
						</span>
						{!schedule.enabled && (
							<Badge variant='outline' className='text-xs px-1 py-0'>
								Disabled
							</Badge>
						)}
					</div>
				) : (
					<span className='text-xs text-muted-foreground'>Not configured</span>
				)}
			</td>
			<td className='px-3 py-2 text-right'>
				<Button variant='ghost' size='sm' className='h-7 px-2' onClick={onEdit}>
					{schedule ? 'Edit' : <Plus className='h-3.5 w-3.5' />}
				</Button>
			</td>
		</tr>
	);
}
