import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import DataTable from '../components/ui/DataTable';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
	Shield,
	Clock,
	Search,
	Filter,
	User,
	Monitor,
	Database,
	Terminal,
	RefreshCw,
	Download,
	ChevronLeft,
	ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { dashboardApi } from '../services/api';

interface AuditLogEntry {
	id: number;
	user_id: number;
	user_name: string | null;
	action: string;
	entity_type: string;
	entity_id: string;
	details: string | null;
	ip_address: string | null;
	created_at: string;
}

interface AuditLogsResponse {
	items: AuditLogEntry[];
	total: number;
	has_more: boolean;
}

const AuditLogs: React.FC = () => {
	const [searchTerm, setSearchTerm] = useState('');
	const [actionFilter, setActionFilter] = useState<string>('');
	const [entityFilter, setEntityFilter] = useState<string>('');
	const [hoursFilter, setHoursFilter] = useState<number | undefined>(undefined);
	const [page, setPage] = useState(0);
	const limit = 50;

	// Fetch audit logs from API
	const { data, isLoading, refetch, isFetching } = useQuery<AuditLogsResponse>({
		queryKey: ['audit-logs', page, actionFilter, entityFilter, hoursFilter],
		queryFn: async () => {
			const response = await dashboardApi.getAuditLogs({
				limit,
				offset: page * limit,
				action: actionFilter || undefined,
				entity_type: entityFilter || undefined,
				hours: hoursFilter,
			});
			return response.data;
		},
	});

	const logs = data?.items || [];
	const total = data?.total || 0;
	const hasMore = data?.has_more || false;

	const getActionIcon = (action: string) => {
		switch (action) {
			case 'login':
				return <User className='w-4 h-4 text-blue-500' />;
			case 'deploy':
				return <Terminal className='w-4 h-4 text-purple-500' />;
			case 'update':
				return <Monitor className='w-4 h-4 text-yellow-500' />;
			case 'create':
				return <Database className='w-4 h-4 text-green-500' />;
			default:
				return <Clock className='w-4 h-4 text-gray-500' />;
		}
	};

	const getActionColor = (action: string) => {
		switch (action) {
			case 'login':
				return 'bg-blue-100 text-blue-800';
			case 'deploy':
				return 'bg-purple-100 text-purple-800';
			case 'update':
				return 'bg-yellow-100 text-yellow-800';
			case 'create':
				return 'bg-green-100 text-green-800';
			case 'delete':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	};

	const filteredLogs = logs.filter(log => {
		if (!searchTerm) return true;
		const searchLower = searchTerm.toLowerCase();
		return (
			log.user_name?.toLowerCase().includes(searchLower) ||
			log.action.toLowerCase().includes(searchLower) ||
			log.details?.toLowerCase().includes(searchLower) ||
			log.entity_type.toLowerCase().includes(searchLower)
		);
	});

	const columns: ColumnDef<AuditLogEntry>[] = [
		{
			id: 'timestamp',
			header: 'Timestamp',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500 whitespace-nowrap'>
					{new Date(row.original.created_at).toLocaleString()}
				</span>
			),
		},
		{
			id: 'user',
			header: 'User',
			cell: ({ row }) => (
				<div className='flex items-center'>
					<div className='h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 mr-3'>
						{(row.original.user_name || 'S').charAt(0)}
					</div>
					<div className='text-sm font-medium text-gray-900'>
						{row.original.user_name || 'System'}
					</div>
				</div>
			),
		},
		{
			id: 'action',
			header: 'Action',
			cell: ({ row }) => (
				<Badge
					className={`flex items-center w-fit space-x-1 ${getActionColor(
						row.original.action,
					)}`}
				>
					{getActionIcon(row.original.action)}
					<span className='capitalize ml-1'>{row.original.action}</span>
				</Badge>
			),
		},
		{
			id: 'entity',
			header: 'Entity',
			cell: ({ row }) => (
				<div className='text-sm text-gray-600'>
					<span className='capitalize font-medium'>
						{row.original.entity_type}
					</span>
					<span className='text-gray-400 mx-1'>:</span>
					<span className='font-mono text-xs'>{row.original.entity_id}</span>
				</div>
			),
		},
		{
			id: 'details',
			header: 'Details',
			cell: ({ row }) => (
				<div
					className='text-sm text-gray-600 max-w-xs truncate'
					title={row.original.details || ''}
				>
					{row.original.details || '-'}
				</div>
			),
		},
		{
			id: 'ip',
			header: 'IP Address',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500 font-mono'>
					{row.original.ip_address || '-'}
				</span>
			),
		},
	];

	const exportCSV = () => {
		if (filteredLogs.length === 0) {
			toast.error('No logs to export');
			return;
		}

		const headers = [
			'Timestamp',
			'User',
			'Action',
			'Entity Type',
			'Entity ID',
			'Details',
			'IP Address',
		];
		const rows = filteredLogs.map(log => [
			new Date(log.created_at).toISOString(),
			log.user_name || 'System',
			log.action,
			log.entity_type,
			log.entity_id,
			log.details || '',
			log.ip_address || '',
		]);

		const csv = [
			headers.join(','),
			...rows.map(r => r.map(c => `"${c}"`).join(',')),
		].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success('CSV exported');
	};

	if (isLoading)
		return (
			<div className='flex justify-center p-12'>
				<LoadingSpinner />
			</div>
		);

	return (
		<div className='space-y-6'>
			<div className='flex justify-between items-center'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Audit Logs</h1>
					<p className='text-gray-600'>
						Track system activity and user actions ({total} total)
					</p>
				</div>
				<div className='flex space-x-2'>
					<Button
						variant='outline'
						onClick={() => refetch()}
						disabled={isFetching}
					>
						<RefreshCw
							className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`}
						/>{' '}
						Refresh
					</Button>
					<Button variant='outline' onClick={exportCSV}>
						<Download className='w-4 h-4 mr-2' /> Export CSV
					</Button>
				</div>
			</div>

			{/* Filters */}
			<div className='flex flex-wrap gap-4 items-center'>
				<div className='relative flex-1 min-w-[200px] max-w-md'>
					<div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
						<Search className='h-5 w-5 text-gray-400' />
					</div>
					<input
						type='text'
						className='block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm'
						placeholder='Search logs...'
						value={searchTerm}
						onChange={e => setSearchTerm(e.target.value)}
					/>
				</div>

				<select
					value={actionFilter}
					onChange={e => {
						setActionFilter(e.target.value);
						setPage(0);
					}}
					className='px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500'
				>
					<option value=''>All Actions</option>
					<option value='create'>Create</option>
					<option value='update'>Update</option>
					<option value='delete'>Delete</option>
					<option value='login'>Login</option>
					<option value='deploy'>Deploy</option>
					<option value='backup'>Backup</option>
					<option value='restore'>Restore</option>
				</select>

				<select
					value={entityFilter}
					onChange={e => {
						setEntityFilter(e.target.value);
						setPage(0);
					}}
					className='px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500'
				>
					<option value=''>All Entities</option>
					<option value='project'>Project</option>
					<option value='server'>Server</option>
					<option value='client'>Client</option>
					<option value='backup'>Backup</option>
					<option value='user'>User</option>
					<option value='monitor'>Monitor</option>
				</select>

				<select
					value={hoursFilter || ''}
					onChange={e => {
						setHoursFilter(
							e.target.value ? parseInt(e.target.value) : undefined,
						);
						setPage(0);
					}}
					className='px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500'
				>
					<option value=''>All Time</option>
					<option value='1'>Last Hour</option>
					<option value='24'>Last 24 Hours</option>
					<option value='168'>Last 7 Days</option>
					<option value='720'>Last 30 Days</option>
				</select>
			</div>

			<Card>
				<DataTable
					columns={columns}
					data={filteredLogs}
					showFilter={false}
					filterValue=''
					onFilterChange={() => {}}
					filterPlaceholder=''
					emptyMessage='No audit logs found.'
					initialPageSize={50}
				/>

				{/* Pagination */}
				{total > limit && (
					<div className='flex items-center justify-between border-t px-6 py-3'>
						<div className='text-sm text-gray-500'>
							Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)}{' '}
							of {total}
						</div>
						<div className='flex space-x-2'>
							<Button
								variant='outline'
								size='sm'
								disabled={page === 0}
								onClick={() => setPage(p => p - 1)}
							>
								<ChevronLeft className='w-4 h-4' />
							</Button>
							<Button
								variant='outline'
								size='sm'
								disabled={!hasMore}
								onClick={() => setPage(p => p + 1)}
							>
								<ChevronRight className='w-4 h-4' />
							</Button>
						</div>
					</div>
				)}
			</Card>
		</div>
	);
};

export default AuditLogs;
