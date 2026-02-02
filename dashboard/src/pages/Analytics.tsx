import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Gauge, RefreshCw, X } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { dashboardApi } from '@/services/api';
import toast from 'react-hot-toast';

interface ProjectSummary {
	id: number;
	name: string;
	domain: string;
	status: string;
}

interface EnvironmentSummary {
	id: number;
	environment: string;
	wp_url?: string | null;
	server_name?: string | null;
}

interface AnalyticsReport {
	id: number;
	report_type: 'ga4' | 'lighthouse';
	environment_id?: number | null;
	url?: string | null;
	property_id?: string | null;
	device?: string | null;
	start_date?: string | null;
	end_date?: string | null;
	summary?: Record<string, any> | null;
	created_at: string;
}

export default function Analytics() {
	const queryClient = useQueryClient();
	const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
		null
	);
	const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<
		number | null
	>(null);
	const [gaPropertyId, setGaPropertyId] = useState('');
	const [gaDays, setGaDays] = useState(30);
	const [lighthouseUrl, setLighthouseUrl] = useState('');
	const [lighthouseUrlTouched, setLighthouseUrlTouched] = useState(false);
	const [lighthouseDevice, setLighthouseDevice] = useState<
		'desktop' | 'mobile'
	>('desktop');
	const [lighthouseError, setLighthouseError] = useState<string | null>(null);
	const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

	const { data: projectsData, isLoading: projectsLoading } = useQuery({
		queryKey: ['projects-remote'],
		queryFn: dashboardApi.getRemoteProjects,
	});

	const projects: ProjectSummary[] = projectsData?.data || [];

	const { data: environmentsData } = useQuery({
		queryKey: ['project-environments', selectedProjectId],
		queryFn: () =>
			dashboardApi.getProjectEnvironments(selectedProjectId as number),
		enabled: !!selectedProjectId,
	});

	const environments: EnvironmentSummary[] = environmentsData?.data || [];

	useEffect(() => {
		if (!selectedProjectId && projects.length > 0) {
			setSelectedProjectId(projects[0].id);
		}
	}, [projects, selectedProjectId]);

	useEffect(() => {
		if (!selectedEnvironmentId && environments.length > 0) {
			setSelectedEnvironmentId(environments[0].id);
		}
	}, [environments, selectedEnvironmentId]);

	useEffect(() => {
		if (!selectedEnvironmentId) return;
		const selectedEnv = environments.find(
			env => env.id === selectedEnvironmentId
		);
		if (!selectedEnv?.wp_url) return;
		if (!lighthouseUrlTouched || lighthouseUrl.trim() === '') {
			setLighthouseUrl(selectedEnv.wp_url);
		}
	}, [
		selectedEnvironmentId,
		environments,
		lighthouseUrlTouched,
		lighthouseUrl,
	]);

	const { data: ga4ReportsData, isLoading: ga4Loading } = useQuery({
		queryKey: [
			'analytics-reports',
			selectedProjectId,
			selectedEnvironmentId,
			'ga4',
		],
		queryFn: () =>
			dashboardApi.getAnalyticsReports({
				project_id: selectedProjectId as number,
				environment_id: selectedEnvironmentId || undefined,
				report_type: 'ga4',
				limit: 5,
			}),
		enabled: !!selectedProjectId,
	});

	const { data: lighthouseReportsData, isLoading: lighthouseLoading } =
		useQuery({
			queryKey: [
				'analytics-reports',
				selectedProjectId,
				selectedEnvironmentId,
				'lighthouse',
			],
			queryFn: () =>
				dashboardApi.getAnalyticsReports({
					project_id: selectedProjectId as number,
					environment_id: selectedEnvironmentId || undefined,
					report_type: 'lighthouse',
					limit: 5,
				}),
			enabled: !!selectedProjectId,
		});

	const ga4Reports: AnalyticsReport[] = ga4ReportsData?.data?.items || [];
	const lighthouseReports: AnalyticsReport[] =
		lighthouseReportsData?.data?.items || [];
	const latestGa4 = ga4Reports[0];
	const latestLighthouse = lighthouseReports[0];

	const runGa4Mutation = useMutation({
		mutationFn: () =>
			dashboardApi.runGa4Report({
				project_id: selectedProjectId as number,
				environment_id: selectedEnvironmentId || undefined,
				property_id: gaPropertyId || undefined,
				days: gaDays,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [
					'analytics-reports',
					selectedProjectId,
					selectedEnvironmentId,
					'ga4',
				],
			});
			toast.success('GA4 report generated');
		},
		onError: () => toast.error('Failed to generate GA4 report'),
	});

	const runLighthouseMutation = useMutation({
		mutationFn: () =>
			dashboardApi.runLighthouseReport({
				project_id: selectedProjectId as number,
				environment_id: selectedEnvironmentId || undefined,
				url: lighthouseUrl || undefined,
				device: lighthouseDevice,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [
					'analytics-reports',
					selectedProjectId,
					selectedEnvironmentId,
					'lighthouse',
				],
			});
			setLighthouseError(null);
			toast.success('Lighthouse report generated');
		},
		onError: (error: any) => {
			const message =
				error?.response?.data?.detail ||
				error?.message ||
				'Failed to run Lighthouse';
			setLighthouseError(message);
			toast.error(message);
		},
	});

	const formattedProjects = useMemo(() => {
		return projects.map(project => ({
			id: project.id,
			label: project.name,
			domain: project.domain,
		}));
	}, [projects]);

	const formattedEnvironments = useMemo(() => {
		return environments.map(env => ({
			id: env.id,
			label: `${env.environment?.toUpperCase?.() || env.environment}`,
			url: env.wp_url,
		}));
	}, [environments]);

	const environmentLabelFor = (environmentId?: number | null) => {
		if (!environmentId) return '—';
		const match = formattedEnvironments.find(env => env.id === environmentId);
		return match?.label || '—';
	};

	const formatDate = (value?: string | null) => {
		if (!value) return '—';
		return new Date(value).toLocaleString();
	};

	const { data: reportDetailData } = useQuery({
		queryKey: ['analytics-report', selectedReportId],
		queryFn: () => dashboardApi.getAnalyticsReport(selectedReportId as number),
		enabled: !!selectedReportId,
	});

	const reportDetail = reportDetailData?.data;

	if (projectsLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			<div className='flex items-center justify-between gap-4'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Analytics</h1>
					<p className='mt-1 text-sm text-gray-500'>
						On-demand GA4 and Lighthouse SEO reports
					</p>
				</div>
				<div className='flex flex-col sm:flex-row gap-3 min-w-[240px]'>
					<select
						className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
						value={selectedProjectId ?? ''}
						onChange={event => setSelectedProjectId(Number(event.target.value))}
					>
						{formattedProjects.map(project => (
							<option key={project.id} value={project.id}>
								{project.label}
							</option>
						))}
					</select>
					<select
						className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
						value={selectedEnvironmentId ?? ''}
						onChange={event =>
							setSelectedEnvironmentId(Number(event.target.value))
						}
						disabled={!formattedEnvironments.length}
					>
						{formattedEnvironments.map(env => (
							<option key={env.id} value={env.id}>
								{env.label}
							</option>
						))}
					</select>
				</div>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				<Card>
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<BarChart3 className='w-5 h-5 text-blue-600' />
							<h2 className='text-lg font-semibold text-gray-900'>
								GA4 Snapshot
							</h2>
						</div>
						<Button
							variant='primary'
							onClick={() => runGa4Mutation.mutate()}
							disabled={!selectedProjectId || runGa4Mutation.isPending}
						>
							<RefreshCw className='w-4 h-4 mr-2' />
							Run GA4
						</Button>
					</div>

					<div className='mt-4 space-y-3'>
						<div className='flex gap-3'>
							<input
								className='flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm'
								placeholder='GA4 Property ID (optional)'
								value={gaPropertyId}
								onChange={event => setGaPropertyId(event.target.value)}
							/>
							<input
								className='w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm'
								type='number'
								min={1}
								max={365}
								value={gaDays}
								onChange={event => setGaDays(Number(event.target.value))}
							/>
						</div>
						<p className='text-xs text-gray-500'>
							Days back for GA4 aggregation.
						</p>
					</div>

					<div className='mt-6 border rounded-lg overflow-hidden'>
						<table className='w-full text-sm'>
							<thead className='bg-gray-50 text-gray-600'>
								<tr>
									<th className='px-4 py-2 text-left'>Metric</th>
									<th className='px-4 py-2 text-left'>Value</th>
								</tr>
							</thead>
							<tbody className='divide-y'>
								<tr>
									<td className='px-4 py-2'>Sessions</td>
									<td className='px-4 py-2'>
										{latestGa4?.summary?.total_sessions ?? '—'}
									</td>
								</tr>
								<tr>
									<td className='px-4 py-2'>Users</td>
									<td className='px-4 py-2'>
										{latestGa4?.summary?.total_users ?? '—'}
									</td>
								</tr>
								<tr>
									<td className='px-4 py-2'>Pageviews</td>
									<td className='px-4 py-2'>
										{latestGa4?.summary?.total_pageviews ?? '—'}
									</td>
								</tr>
								<tr>
									<td className='px-4 py-2'>Bounce Rate</td>
									<td className='px-4 py-2'>
										{latestGa4?.summary?.avg_bounce_rate ?? '—'}
									</td>
								</tr>
								<tr>
									<td className='px-4 py-2'>Latest report</td>
									<td className='px-4 py-2'>
										{latestGa4
											? formatDate(latestGa4.created_at)
											: 'No reports yet'}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</Card>

				<Card>
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<Gauge className='w-5 h-5 text-emerald-600' />
							<h2 className='text-lg font-semibold text-gray-900'>
								Lighthouse SEO
							</h2>
						</div>
						<Button
							variant='primary'
							onClick={() => runLighthouseMutation.mutate()}
							disabled={!selectedProjectId || runLighthouseMutation.isPending}
						>
							<RefreshCw className='w-4 h-4 mr-2' />
							Run Test
						</Button>
					</div>

					{lighthouseError && (
						<div className='mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700'>
							<p className='font-medium'>Lighthouse unavailable</p>
							<p className='mt-1'>{lighthouseError}</p>
							<p className='mt-2'>Run: npm install -g lighthouse</p>
						</div>
					)}

					<div className='mt-4 space-y-3'>
						<input
							className='w-full border border-gray-300 rounded-lg px-3 py-2 text-sm'
							placeholder='Override URL (optional)'
							value={lighthouseUrl}
							onChange={event => {
								setLighthouseUrlTouched(true);
								setLighthouseUrl(event.target.value);
							}}
						/>
						<div className='flex gap-2'>
							<Button
								variant={
									lighthouseDevice === 'desktop' ? 'primary' : 'secondary'
								}
								onClick={() => setLighthouseDevice('desktop')}
							>
								Desktop
							</Button>
							<Button
								variant={
									lighthouseDevice === 'mobile' ? 'primary' : 'secondary'
								}
								onClick={() => setLighthouseDevice('mobile')}
							>
								Mobile
							</Button>
						</div>
					</div>

					<div className='mt-6 border rounded-lg overflow-hidden'>
						<table className='w-full text-sm'>
							<thead className='bg-gray-50 text-gray-600'>
								<tr>
									<th className='px-4 py-2 text-left'>Metric</th>
									<th className='px-4 py-2 text-left'>Value</th>
								</tr>
							</thead>
							<tbody className='divide-y'>
								<tr>
									<td className='px-4 py-2'>SEO Score</td>
									<td className='px-4 py-2'>
										{latestLighthouse?.summary?.seo_score ?? '—'}
									</td>
								</tr>
								<tr>
									<td className='px-4 py-2'>Performance</td>
									<td className='px-4 py-2'>
										{latestLighthouse?.summary?.performance_score ?? '—'}
									</td>
								</tr>
								<tr>
									<td className='px-4 py-2'>Accessibility</td>
									<td className='px-4 py-2'>
										{latestLighthouse?.summary?.accessibility_score ?? '—'}
									</td>
								</tr>
								<tr>
									<td className='px-4 py-2'>Best Practices</td>
									<td className='px-4 py-2'>
										{latestLighthouse?.summary?.best_practices_score ?? '—'}
									</td>
								</tr>
								<tr>
									<td className='px-4 py-2'>Latest report</td>
									<td className='px-4 py-2'>
										{latestLighthouse
											? formatDate(latestLighthouse.created_at)
											: 'No reports yet'}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</Card>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				<Card>
					<div className='flex items-center justify-between'>
						<h3 className='text-lg font-semibold text-gray-900'>GA4 History</h3>
					</div>
					<div className='mt-4'>
						{ga4Loading ? (
							<div className='text-sm text-gray-500'>Loading history...</div>
						) : ga4Reports.length === 0 ? (
							<div className='text-sm text-gray-500'>No reports yet.</div>
						) : (
							<div className='border rounded-lg overflow-hidden'>
								<table className='w-full text-sm'>
									<thead className='bg-gray-50 text-gray-600'>
										<tr>
											<th className='px-4 py-2 text-left'>Date</th>
											<th className='px-4 py-2 text-left'>Env</th>
											<th className='px-4 py-2 text-left'>Sessions</th>
											<th className='px-4 py-2 text-left'>Users</th>
											<th className='px-4 py-2 text-left'>Action</th>
										</tr>
									</thead>
									<tbody className='divide-y'>
										{ga4Reports.map(report => (
											<tr key={report.id}>
												<td className='px-4 py-2'>
													{formatDate(report.created_at)}
												</td>
												<td className='px-4 py-2'>
													{environmentLabelFor(report.environment_id)}
												</td>
												<td className='px-4 py-2'>
													{report.summary?.total_sessions ?? '—'}
												</td>
												<td className='px-4 py-2'>
													{report.summary?.total_users ?? '—'}
												</td>
												<td className='px-4 py-2'>
													<Button
														size='sm'
														variant='secondary'
														onClick={() => setSelectedReportId(report.id)}
													>
														View
													</Button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</Card>

				<Card>
					<div className='flex items-center justify-between'>
						<h3 className='text-lg font-semibold text-gray-900'>
							Lighthouse History
						</h3>
					</div>
					<div className='mt-4'>
						{lighthouseLoading ? (
							<div className='text-sm text-gray-500'>Loading history...</div>
						) : lighthouseReports.length === 0 ? (
							<div className='text-sm text-gray-500'>No reports yet.</div>
						) : (
							<div className='border rounded-lg overflow-hidden'>
								<table className='w-full text-sm'>
									<thead className='bg-gray-50 text-gray-600'>
										<tr>
											<th className='px-4 py-2 text-left'>Date</th>
											<th className='px-4 py-2 text-left'>Env</th>
											<th className='px-4 py-2 text-left'>Device</th>
											<th className='px-4 py-2 text-left'>SEO</th>
											<th className='px-4 py-2 text-left'>Action</th>
										</tr>
									</thead>
									<tbody className='divide-y'>
										{lighthouseReports.map(report => (
											<tr key={report.id}>
												<td className='px-4 py-2'>
													{formatDate(report.created_at)}
												</td>
												<td className='px-4 py-2'>
													{environmentLabelFor(report.environment_id)}
												</td>
												<td className='px-4 py-2'>
													{report.device || 'desktop'}
												</td>
												<td className='px-4 py-2'>
													{report.summary?.seo_score ?? '—'}
												</td>
												<td className='px-4 py-2'>
													<Button
														size='sm'
														variant='secondary'
														onClick={() => setSelectedReportId(report.id)}
													>
														View
													</Button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</Card>
			</div>

			{selectedReportId && reportDetail && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4'>
					<div className='bg-white rounded-xl shadow-xl w-full max-w-3xl'>
						<div className='flex items-center justify-between border-b px-5 py-4'>
							<div>
								<h3 className='text-lg font-semibold text-gray-900'>
									Report details
								</h3>
								<p className='text-xs text-gray-500'>
									{reportDetail.report_type?.toUpperCase?.()}
									{reportDetail.url ? ` • ${reportDetail.url}` : ''}
								</p>
							</div>
							<Button
								variant='secondary'
								size='sm'
								onClick={() => setSelectedReportId(null)}
							>
								<X className='w-4 h-4' />
							</Button>
						</div>
						<div className='p-5 space-y-4'>
							<div className='grid grid-cols-2 gap-4 text-sm'>
								<div>
									<div className='text-xs text-gray-500'>Environment</div>
									<div className='text-gray-900'>
										{environmentLabelFor(reportDetail.environment_id)}
									</div>
								</div>
								<div>
									<div className='text-xs text-gray-500'>Created</div>
									<div className='text-gray-900'>
										{formatDate(reportDetail.created_at)}
									</div>
								</div>
							</div>
							<div className='border rounded-lg bg-gray-50 p-4 text-xs text-gray-700 overflow-auto max-h-64'>
								<pre className='whitespace-pre-wrap'>
									{JSON.stringify(reportDetail.summary || {}, null, 2)}
								</pre>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
