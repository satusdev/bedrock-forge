import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	PageHeader,
	DataTable,
	type Column,
	Pagination,
} from '@/components/crud';

const RESOURCE_TYPES = [
	'backup',
	'server',
	'project',
	'client',
	'domain',
	'environment',
	'monitor',
	'user',
	'auth',
	'invoice',
	'package',
];

interface AuditLogUser {
	id: number;
	name: string;
	email: string;
}

interface AuditLog {
	id: number;
	user_id: number | null;
	action: string;
	resource_type: string | null;
	resource_id: number | null;
	metadata: Record<string, unknown> | null;
	ip_address: string | null;
	created_at: string;
	user: AuditLogUser | null;
}

interface AuditLogsResponse {
	data: AuditLog[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

const LIMIT = 25;

function MetadataCell({
	metadata,
}: {
	metadata: Record<string, unknown> | null;
}) {
	const [open, setOpen] = useState(false);
	if (!metadata)
		return <span className='text-muted-foreground text-xs'>—</span>;
	return (
		<div className='max-w-xs'>
			<Button
				variant='ghost'
				size='sm'
				className='h-6 px-1 text-xs gap-1'
				onClick={() => setOpen(v => !v)}
			>
				{open ? (
					<ChevronDown className='h-3 w-3' />
				) : (
					<ChevronRight className='h-3 w-3' />
				)}
				{open ? 'Hide' : 'Show'}
			</Button>
			{open && (
				<pre className='mt-1 text-xs bg-muted rounded p-2 overflow-x-auto max-h-32 leading-relaxed'>
					{JSON.stringify(metadata, null, 2)}
				</pre>
			)}
		</div>
	);
}

const columns: Column<AuditLog>[] = [
	{
		header: 'Time',
		render: row => (
			<span className='text-xs text-muted-foreground whitespace-nowrap'>
				{new Date(row.created_at).toLocaleString()}
			</span>
		),
	},
	{
		header: 'User',
		render: row =>
			row.user ? (
				<div>
					<div className='text-sm font-medium'>{row.user.name}</div>
					<div className='text-xs text-muted-foreground'>{row.user.email}</div>
				</div>
			) : (
				<span className='text-muted-foreground text-xs'>System</span>
			),
	},
	{
		header: 'Action',
		render: row => (
			<span className='font-mono text-xs bg-muted px-1.5 py-0.5 rounded'>
				{row.action}
			</span>
		),
	},
	{
		header: 'Resource',
		render: row =>
			row.resource_type ? (
				<span className='text-sm capitalize'>{row.resource_type}</span>
			) : (
				<span className='text-muted-foreground text-xs'>—</span>
			),
	},
	{
		header: 'Resource ID',
		render: row =>
			row.resource_id != null ? (
				<span className='font-mono text-xs'>{String(row.resource_id)}</span>
			) : (
				<span className='text-muted-foreground text-xs'>—</span>
			),
	},
	{
		header: 'IP Address',
		render: row =>
			row.ip_address ? (
				<span className='font-mono text-xs'>{row.ip_address}</span>
			) : (
				<span className='text-muted-foreground text-xs'>—</span>
			),
	},
	{
		header: 'Metadata',
		render: row => <MetadataCell metadata={row.metadata} />,
	},
];

export function AuditLogsPage() {
	const [page, setPage] = useState(1);
	const [action, setAction] = useState('');
	const [resourceType, setResourceType] = useState('');
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo, setDateTo] = useState('');

	// Committed filter values (applied on search button)
	const [filters, setFilters] = useState({
		action: '',
		resourceType: '',
		dateFrom: '',
		dateTo: '',
	});

	const { data, isLoading } = useQuery({
		queryKey: ['audit-logs', page, filters],
		queryFn: () => {
			const params = new URLSearchParams({
				page: String(page),
				limit: String(LIMIT),
			});
			if (filters.action) params.set('action', filters.action);
			if (filters.resourceType)
				params.set('resource_type', filters.resourceType);
			if (filters.dateFrom) params.set('date_from', filters.dateFrom);
			if (filters.dateTo) params.set('date_to', filters.dateTo);
			return api.get<AuditLogsResponse>(`/audit-logs?${params.toString()}`);
		},
		placeholderData: prev => prev,
	});

	const handleSearch = () => {
		setPage(1);
		setFilters({ action, resourceType, dateFrom, dateTo });
	};

	const handleReset = () => {
		setAction('');
		setResourceType('');
		setDateFrom('');
		setDateTo('');
		setPage(1);
		setFilters({ action: '', resourceType: '', dateFrom: '', dateTo: '' });
	};

	return (
		<div className='space-y-6'>
			<PageHeader title='Audit Logs' />

			{/* Filters */}
			<div className='bg-card border rounded-lg p-4 space-y-4'>
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
					<div className='space-y-1.5'>
						<Label htmlFor='action-filter'>Action</Label>
						<Input
							id='action-filter'
							placeholder='e.g. backup.create'
							value={action}
							onChange={e => setAction(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && handleSearch()}
						/>
					</div>

					<div className='space-y-1.5'>
						<Label>Resource Type</Label>
						<Select value={resourceType} onValueChange={setResourceType}>
							<SelectTrigger>
								<SelectValue placeholder='All types' />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value=''>All types</SelectItem>
								{RESOURCE_TYPES.map(t => (
									<SelectItem key={t} value={t}>
										{t.charAt(0).toUpperCase() + t.slice(1)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className='space-y-1.5'>
						<Label htmlFor='date-from'>From</Label>
						<Input
							id='date-from'
							type='date'
							value={dateFrom}
							onChange={e => setDateFrom(e.target.value)}
						/>
					</div>

					<div className='space-y-1.5'>
						<Label htmlFor='date-to'>To</Label>
						<Input
							id='date-to'
							type='date'
							value={dateTo}
							onChange={e => setDateTo(e.target.value)}
						/>
					</div>
				</div>

				<div className='flex gap-2'>
					<Button onClick={handleSearch} size='sm'>
						Apply Filters
					</Button>
					<Button onClick={handleReset} variant='outline' size='sm'>
						Reset
					</Button>
				</div>
			</div>

			{/* Table */}
			<DataTable
				columns={columns}
				data={data?.data ?? []}
				isLoading={isLoading}
				emptyMessage='No audit log entries match your filters.'
				rowKey={row => row.id}
			/>

			{(data?.totalPages ?? 1) > 1 && (
				<Pagination
					page={page}
					totalPages={data?.totalPages ?? 1}
					onPageChange={setPage}
				/>
			)}
		</div>
	);
}
