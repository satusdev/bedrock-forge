import { useState, useEffect } from 'react';
import { apiFetch } from '@/config/env';

interface Monitor {
	name: string;
	status: string;
	uptime_24h: number;
	uptime_30d: number;
	response_time_ms: number | null;
}

interface StatusData {
	project_name: string;
	overall_status: string;
	monitors: Monitor[];
	last_updated: string;
}

interface StatusWidgetProps {
	projectId: number;
	compact?: boolean;
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
	};

export function StatusWidget({
	projectId,
	compact = false,
}: StatusWidgetProps) {
	const [status, setStatus] = useState<StatusData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchStatus();
		const interval = setInterval(fetchStatus, 60000); // Refresh every minute
		return () => clearInterval(interval);
	}, [projectId]);

	const fetchStatus = async () => {
		try {
			const response = await apiFetch(`/api/status/${projectId}`);
			if (!response.ok) throw new Error('Failed to fetch status');
			const data = await response.json();
			setStatus(data);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<div className='animate-pulse p-4 bg-gray-100 rounded-lg'>
				<div className='h-6 bg-gray-200 rounded w-1/3 mb-3'></div>
				<div className='h-4 bg-gray-200 rounded w-full'></div>
			</div>
		);
	}

	if (error || !status) {
		return (
			<div className='p-4 bg-gray-100 rounded-lg text-gray-500'>
				Status unavailable
			</div>
		);
	}

	const statusStyle =
		STATUS_COLORS[status.overall_status] || STATUS_COLORS.operational;

	if (compact) {
		return (
			<div
				className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${statusStyle.bg}`}
			>
				<span
					className={`w-2 h-2 rounded-full animate-pulse ${statusStyle.dot}`}
				></span>
				<span className={`text-sm font-medium ${statusStyle.text}`}>
					{status.overall_status.replace('_', ' ')}
				</span>
			</div>
		);
	}

	return (
		<div className='status-widget rounded-lg border overflow-hidden'>
			{/* Header */}
			<div className={`p-4 ${statusStyle.bg}`}>
				<div className='flex items-center justify-between'>
					<h3 className='font-semibold'>{status.project_name}</h3>
					<div className='flex items-center gap-2'>
						<span
							className={`w-2.5 h-2.5 rounded-full animate-pulse ${statusStyle.dot}`}
						></span>
						<span className={`font-medium capitalize ${statusStyle.text}`}>
							{status.overall_status.replace('_', ' ')}
						</span>
					</div>
				</div>
			</div>

			{/* Monitors */}
			<div className='divide-y'>
				{status.monitors.map(monitor => (
					<div
						key={monitor.name}
						className='p-3 flex items-center justify-between'
					>
						<div className='flex items-center gap-2'>
							<span
								className={`w-2 h-2 rounded-full ${
									monitor.status === 'up'
										? 'bg-green-500'
										: monitor.status === 'degraded'
											? 'bg-yellow-500'
											: 'bg-red-500'
								}`}
							></span>
							<span className='font-medium'>{monitor.name}</span>
						</div>

						<div className='flex items-center gap-4 text-sm text-gray-600'>
							<span title='24h uptime'>{monitor.uptime_24h.toFixed(1)}%</span>
							{monitor.response_time_ms && (
								<span title='Response time'>{monitor.response_time_ms}ms</span>
							)}
						</div>
					</div>
				))}
			</div>

			{/* Footer */}
			<div className='p-2 bg-gray-50 text-xs text-gray-500 text-center'>
				Last updated: {new Date(status.last_updated).toLocaleTimeString()}
			</div>
		</div>
	);
}

export default StatusWidget;
