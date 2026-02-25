import { type ColumnDef } from '@tanstack/react-table';
import {
	AlertTriangle,
	CheckCircle,
	Edit3,
	Pause,
	Play,
	Trash2,
	XCircle,
} from 'lucide-react';

import Button from '@/components/ui/Button';
import type { Monitor } from './types';

interface MonitoringColumnsProps {
	onTogglePause: (monitor: Monitor) => void;
	onDelete: (monitor: Monitor) => void;
}

function getStatusIcon(status: string | null, isActive: boolean) {
	if (!isActive) return <Pause className='w-5 h-5 text-gray-400' />;
	if (status === 'up')
		return <CheckCircle className='w-5 h-5 text-green-500' />;
	if (status === 'down') return <XCircle className='w-5 h-5 text-red-500' />;
	return <AlertTriangle className='w-5 h-5 text-yellow-500' />;
}

function getUptimeColor(uptime: number | null) {
	if (!uptime) return 'text-gray-500';
	if (uptime >= 99.9) return 'text-green-600';
	if (uptime >= 99) return 'text-yellow-600';
	return 'text-red-600';
}

export function createMonitoringColumns({
	onTogglePause,
	onDelete,
}: MonitoringColumnsProps): ColumnDef<Monitor>[] {
	return [
		{
			id: 'statusIcon',
			header: 'Status',
			cell: ({ row }) =>
				getStatusIcon(row.original.last_status, row.original.is_active),
		},
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }) => (
				<div>
					<div className='font-medium text-gray-900 dark:text-gray-100'>
						{row.original.name}
					</div>
					<div className='text-sm text-gray-500 capitalize dark:text-gray-400'>
						{row.original.monitor_type}
					</div>
				</div>
			),
		},
		{
			accessorKey: 'url',
			header: 'URL',
			cell: ({ row }) => (
				<div className='text-sm text-gray-500 max-w-xs truncate dark:text-gray-400'>
					{row.original.url}
				</div>
			),
		},
		{
			accessorKey: 'last_response_time_ms',
			header: 'Response',
			cell: ({ row }) => {
				const responseTime = row.original.last_response_time_ms;
				return responseTime ? (
					<span className='text-sm'>{responseTime}ms</span>
				) : (
					<span className='text-sm text-gray-400'>-</span>
				);
			},
		},
		{
			accessorKey: 'last_check_at',
			header: 'Last Checked',
			cell: ({ row }) =>
				row.original.last_check_at ? (
					<span className='text-sm text-gray-500 dark:text-gray-400'>
						{new Date(row.original.last_check_at).toLocaleString()}
					</span>
				) : (
					<span className='text-sm text-gray-400'>-</span>
				),
		},
		{
			accessorKey: 'uptime_percentage',
			header: 'Uptime',
			cell: ({ row }) => (
				<span
					className={`text-sm font-medium ${getUptimeColor(row.original.uptime_percentage)}`}
				>
					{row.original.uptime_percentage
						? `${row.original.uptime_percentage.toFixed(2)}%`
						: '-'}
				</span>
			),
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => {
				const monitor = row.original;

				return (
					<div className='flex items-center space-x-2'>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => onTogglePause(monitor)}
							title={monitor.is_active ? 'Pause' : 'Resume'}
						>
							{monitor.is_active ? (
								<Pause className='w-4 h-4' />
							) : (
								<Play className='w-4 h-4' />
							)}
						</Button>
						<Button variant='ghost' size='sm' disabled>
							<Edit3 className='w-4 h-4' />
						</Button>
						<Button variant='ghost' size='sm' onClick={() => onDelete(monitor)}>
							<Trash2 className='w-4 h-4 text-red-500' />
						</Button>
					</div>
				);
			},
		},
	];
}
