import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { apiFetch } from '@/config/env';

interface ActivityItem {
	id: number;
	action: string;
	entity_type: string | null;
	entity_id: string | null;
	details: string | null;
	user_name: string | null;
	created_at: string;
}

interface ActivityFeedProps {
	limit?: number;
	showHeader?: boolean;
}

const ACTION_ICONS: Record<string, string> = {
	create: '➕',
	update: '✏️',
	delete: '🗑️',
	login: '🔐',
	logout: '👋',
	deploy: '🚀',
	backup: '💾',
	restore: '🔄',
	sync: '🔃',
	provision: '🔧',
	command: '⌨️',
	other: '📝',
};

const ACTION_COLORS: Record<string, string> = {
	create: 'bg-green-100 text-green-800',
	update: 'bg-blue-100 text-blue-800',
	delete: 'bg-red-100 text-red-800',
	login: 'bg-purple-100 text-purple-800',
	deploy: 'bg-orange-100 text-orange-800',
	backup: 'bg-teal-100 text-teal-800',
	sync: 'bg-indigo-100 text-indigo-800',
};

export function ActivityFeed({
	limit = 20,
	showHeader = true,
}: ActivityFeedProps) {
	const [activities, setActivities] = useState<ActivityItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchActivities();
	}, [limit]);

	const fetchActivities = async () => {
		try {
			setLoading(true);
			const response = await apiFetch(`/api/activity?limit=${limit}`);
			if (!response.ok) throw new Error('Failed to fetch activities');
			const data = await response.json();
			setActivities(data.items);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<div className='animate-pulse space-y-3'>
				{[...Array(5)].map((_, i) => (
					<div key={i} className='h-12 bg-gray-200 rounded'></div>
				))}
			</div>
		);
	}

	if (error) {
		return <div className='text-red-500 p-4'>Error: {error}</div>;
	}

	return (
		<div className='activity-feed'>
			{showHeader && (
				<div className='flex justify-between items-center mb-4'>
					<h3 className='text-lg font-semibold'>Recent Activity</h3>
					<button
						onClick={fetchActivities}
						className='text-sm text-blue-600 hover:text-blue-800'
					>
						Refresh
					</button>
				</div>
			)}

			<div className='space-y-2'>
				{activities.length === 0 ? (
					<p className='text-gray-500 text-center py-4'>No recent activity</p>
				) : (
					activities.map(activity => (
						<div
							key={activity.id}
							className='flex items-center gap-3 p-3 bg-white rounded-lg border hover:shadow-sm transition-shadow'
						>
							<span className='text-xl'>
								{ACTION_ICONS[activity.action] || '📝'}
							</span>

							<div className='flex-1 min-w-0'>
								<div className='flex items-center gap-2'>
									<span
										className={`px-2 py-0.5 text-xs rounded-full ${ACTION_COLORS[activity.action] || 'bg-gray-100'}`}
									>
										{activity.action}
									</span>
									{activity.entity_type && (
										<span className='text-sm text-gray-600'>
											{activity.entity_type}
											{activity.entity_id && ` #${activity.entity_id}`}
										</span>
									)}
								</div>

								{activity.details && (
									<p className='text-sm text-gray-500 truncate mt-1'>
										{activity.details}
									</p>
								)}
							</div>

							<div className='text-right text-sm text-gray-400'>
								{activity.user_name && (
									<div className='font-medium text-gray-600'>
										{activity.user_name}
									</div>
								)}
								<div>
									{formatDistanceToNow(new Date(activity.created_at), {
										addSuffix: true,
									})}
								</div>
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}

export default ActivityFeed;
