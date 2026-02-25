import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { useParams, useSearchParams } from '@/router/compat';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { dashboardApi } from '@/services/api';

interface MonitorStatusResponse {
	name: string;
	status: string;
	uptime_24h: number;
	uptime_30d: number;
	response_time_ms?: number | null;
	last_check?: string | null;
}

interface IncidentSummary {
	title: string;
	status: string;
	started_at: string;
	resolved_at?: string | null;
	duration_seconds?: number | null;
}

interface StatusPageResponse {
	project_name: string;
	overall_status: string;
	monitors: MonitorStatusResponse[];
	recent_incidents: IncidentSummary[];
	incident_pagination: {
		page: number;
		page_size: number;
		total: number;
	};
	last_updated: string;
}

interface StatusHistoryPoint {
	date: string;
	uptime_percentage: number;
	checks_total: number;
	checks_up: number;
}

interface StatusHistoryResponse {
	project_name: string;
	period_days: number;
	history: StatusHistoryPoint[];
	average_uptime: number;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> =
	{
		operational: {
			bg: 'bg-green-50',
			text: 'text-green-700',
			dot: 'bg-green-500',
		},
		degraded: {
			bg: 'bg-yellow-50',
			text: 'text-yellow-700',
			dot: 'bg-yellow-500',
		},
		partial_outage: {
			bg: 'bg-orange-50',
			text: 'text-orange-700',
			dot: 'bg-orange-500',
		},
		major_outage: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
		maintenance: {
			bg: 'bg-blue-50',
			text: 'text-blue-700',
			dot: 'bg-blue-500',
		},
		unknown: { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' },
	};

const formatDateTime = (value?: string | null) => {
	if (!value) return '—';
	return new Date(value).toLocaleString();
};

const formatDuration = (seconds?: number | null) => {
	if (!seconds && seconds !== 0) return '—';
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	}
	return `${minutes}m`;
};

export default function StatusPage() {
	const { projectId: projectIdParam } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const initialProjectId =
		projectIdParam || searchParams.get('project_id') || '';
	const [projectId, setProjectId] = useState(initialProjectId);
	const [days, setDays] = useState(30);
	const [incidentPage, setIncidentPage] = useState(1);
	const [incidentPageSize, setIncidentPageSize] = useState(5);

	const numericProjectId = useMemo(() => {
		const parsed = Number(projectId);
		return Number.isNaN(parsed) ? 0 : parsed;
	}, [projectId]);

	const statusQuery = useQuery({
		queryKey: [
			'public-status',
			numericProjectId,
			incidentPage,
			incidentPageSize,
		],
		queryFn: async () => {
			const response = await dashboardApi.getPublicStatus(numericProjectId, {
				page: incidentPage,
				page_size: incidentPageSize,
			});
			return response.data as StatusPageResponse;
		},
		enabled: numericProjectId > 0,
	});

	const historyQuery = useQuery({
		queryKey: ['public-status-history', numericProjectId, days],
		queryFn: async () => {
			const response = await dashboardApi.getPublicStatusHistory(
				numericProjectId,
				days,
			);
			return response.data as StatusHistoryResponse;
		},
		enabled: numericProjectId > 0,
	});

	const statusData = statusQuery.data;
	const historyData = historyQuery.data;
	const statusColor = STATUS_COLORS[statusData?.overall_status || 'unknown'];
	const incidentPagination = statusData?.incident_pagination;
	const incidentTotalPages = incidentPagination
		? Math.max(
				1,
				Math.ceil(incidentPagination.total / incidentPagination.page_size),
			)
		: 1;

	const historyColumns: ColumnDef<StatusHistoryPoint>[] = [
		{
			accessorKey: 'date',
			header: 'Date',
		},
		{
			accessorKey: 'uptime_percentage',
			header: 'Uptime %',
			cell: ({ row }) => `${row.original.uptime_percentage.toFixed(2)}%`,
		},
		{
			accessorKey: 'checks_total',
			header: 'Checks',
		},
		{
			accessorKey: 'checks_up',
			header: 'Up',
		},
	];

	useEffect(() => {
		const projectName = statusData?.project_name || 'Status Page';
		document.title = `${projectName} | Status`;
		const description = 'Live service health and recent incidents.';
		let meta = document.querySelector('meta[name="description"]');
		if (!meta) {
			meta = document.createElement('meta');
			meta.setAttribute('name', 'description');
			document.head.appendChild(meta);
		}
		meta.setAttribute('content', description);
	}, [statusData?.project_name]);

	const handleLoad = () => {
		if (!projectId.trim()) return;
		const nextParams = new URLSearchParams(searchParams);
		nextParams.set('project_id', projectId.trim());
		setSearchParams(nextParams);
		setIncidentPage(1);
	};

	return (
		<div className='min-h-screen bg-gray-50 py-12'>
			<div className='max-w-5xl mx-auto px-4 space-y-6'>
				<div className='text-center space-y-2'>
					<h1 className='text-3xl font-bold text-gray-900'>Status Page</h1>
					<p className='text-sm text-gray-500'>
						Live service health and recent incidents.
					</p>
				</div>

				<Card>
					<div className='flex flex-col md:flex-row md:items-end gap-3'>
						<div className='flex-1'>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								Project ID
							</label>
							<input
								value={projectId}
								onChange={event => setProjectId(event.target.value)}
								className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
								placeholder='Enter project ID'
							/>
						</div>
						<div className='w-32'>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								History (days)
							</label>
							<input
								type='number'
								min={1}
								max={90}
								value={days}
								onChange={event => setDays(Number(event.target.value))}
								className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
							/>
						</div>
						<Button variant='primary' onClick={handleLoad}>
							Load Status
						</Button>
					</div>
				</Card>

				{statusQuery.isLoading && (
					<div className='text-center text-sm text-gray-500'>
						Loading status...
					</div>
				)}

				{statusQuery.isError && (
					<Card>
						<div className='text-sm text-red-600'>
							Unable to load status. Please verify the project ID.
						</div>
					</Card>
				)}

				{statusData && (
					<div className='space-y-6'>
						<Card>
							<div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
								<div>
									<h2 className='text-xl font-semibold text-gray-900'>
										{statusData.project_name}
									</h2>
									<p className='text-sm text-gray-500'>
										Last updated: {formatDateTime(statusData.last_updated)}
									</p>
								</div>
								<div
									className={`inline-flex items-center gap-2 px-3 py-2 rounded-full ${statusColor.bg} ${statusColor.text}`}
								>
									<span
										className={`w-2.5 h-2.5 rounded-full ${statusColor.dot}`}
									/>
									<span className='text-sm font-medium capitalize'>
										{statusData.overall_status.replace('_', ' ')}
									</span>
								</div>
							</div>
						</Card>

						<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
							<Card>
								<h3 className='text-lg font-semibold text-gray-900'>
									Monitors
								</h3>
								<div className='mt-4 space-y-3'>
									{statusData.monitors.length === 0 ? (
										<p className='text-sm text-gray-500'>
											No monitors configured.
										</p>
									) : (
										statusData.monitors.map(monitor => (
											<div
												key={monitor.name}
												className='border border-gray-200 rounded-lg px-4 py-3'
											>
												<div className='flex items-center justify-between'>
													<div>
														<p className='text-sm font-medium text-gray-900'>
															{monitor.name}
														</p>
														<p className='text-xs text-gray-500'>
															Last check: {formatDateTime(monitor.last_check)}
														</p>
													</div>
													<span className='text-xs font-semibold uppercase text-gray-600'>
														{monitor.status}
													</span>
												</div>
												<div className='mt-2 grid grid-cols-3 gap-3 text-xs text-gray-600'>
													<div>
														<span className='font-medium'>24h</span>
														<div>{monitor.uptime_24h.toFixed(2)}%</div>
													</div>
													<div>
														<span className='font-medium'>30d</span>
														<div>{monitor.uptime_30d.toFixed(2)}%</div>
													</div>
													<div>
														<span className='font-medium'>Response</span>
														<div>
															{monitor.response_time_ms
																? `${monitor.response_time_ms}ms`
																: '—'}
														</div>
													</div>
												</div>
											</div>
										))
									)}
								</div>
							</Card>

							<Card>
								<h3 className='text-lg font-semibold text-gray-900'>
									Recent Incidents
								</h3>
								<div className='mt-4 space-y-3'>
									{statusData.recent_incidents.length === 0 ? (
										<p className='text-sm text-gray-500'>
											No recent incidents.
										</p>
									) : (
										statusData.recent_incidents.map((incident, index) => (
											<div
												key={`${incident.title}-${index}`}
												className='border border-gray-200 rounded-lg px-4 py-3'
											>
												<p className='text-sm font-medium text-gray-900'>
													{incident.title}
												</p>
												<div className='mt-1 text-xs text-gray-500 space-y-1'>
													<div>Status: {incident.status}</div>
													<div>
														Started: {formatDateTime(incident.started_at)}
													</div>
													<div>
														Resolved: {formatDateTime(incident.resolved_at)}
													</div>
													<div>
														Duration:{' '}
														{formatDuration(incident.duration_seconds)}
													</div>
													{incidentPagination && incidentTotalPages > 1 && (
														<div className='flex items-center justify-between pt-2 text-xs text-gray-500'>
															<button
																className='px-2 py-1 border border-gray-200 rounded'
																onClick={() =>
																	setIncidentPage(p => Math.max(1, p - 1))
																}
																disabled={incidentPage <= 1}
															>
																Previous
															</button>
															<span>
																Page {incidentPage} of {incidentTotalPages}
															</span>
															<button
																className='px-2 py-1 border border-gray-200 rounded'
																onClick={() =>
																	setIncidentPage(p =>
																		Math.min(incidentTotalPages, p + 1),
																	)
																}
																disabled={incidentPage >= incidentTotalPages}
															>
																Next
															</button>
														</div>
													)}
												</div>
											</div>
										))
									)}
								</div>
							</Card>
						</div>

						<Card>
							<h3 className='text-lg font-semibold text-gray-900'>
								Uptime History
							</h3>
							<div className='mt-2 text-sm text-gray-500'>
								Average uptime: {historyData?.average_uptime?.toFixed(2) ?? '—'}
								%
							</div>
							<div className='mt-4'>
								{historyQuery.isLoading ? (
									<p className='text-sm text-gray-500'>Loading history...</p>
								) : historyData?.history?.length ? (
									<DataTable
										columns={historyColumns}
										data={historyData.history}
										showFilter={false}
										filterValue=''
										onFilterChange={() => {}}
										emptyMessage='No uptime history available.'
										initialPageSize={10}
									/>
								) : (
									<p className='text-sm text-gray-500'>
										No uptime history available.
									</p>
								)}
							</div>
						</Card>
					</div>
				)}
			</div>
		</div>
	);
}
