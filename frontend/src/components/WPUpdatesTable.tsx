import { useState, useEffect } from 'react';
import { apiFetch } from '@/config/env';

interface WPUpdate {
	id: number;
	project_id: number;
	project_name: string;
	update_type: string;
	package_name: string;
	current_version: string;
	available_version: string;
}

export function WPUpdatesTable() {
	const [updates, setUpdates] = useState<WPUpdate[]>([]);
	const [loading, setLoading] = useState(true);
	const [updating, setUpdating] = useState<Set<number>>(new Set());
	const [bulkUpdating, setBulkUpdating] = useState(false);

	useEffect(() => {
		fetchUpdates();
	}, []);

	const fetchUpdates = async () => {
		try {
			setLoading(true);
			const response = await apiFetch('/api/wp/updates');
			if (!response.ok) throw new Error('Failed to fetch');
			const data = await response.json();
			setUpdates(data.updates || []);
		} catch (err) {
			console.error('Error fetching updates:', err);
		} finally {
			setLoading(false);
		}
	};

	const triggerUpdate = async (update: WPUpdate) => {
		setUpdating(prev => new Set([...prev, update.id]));
		try {
			const response = await apiFetch('/api/wp/updates/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ update_ids: [update.id] }),
			});
			if (!response.ok) throw new Error('Update failed');

			// Remove from list after successful trigger
			setUpdates(prev => prev.filter(u => u.id !== update.id));
		} catch (err) {
			console.error('Error triggering update:', err);
		} finally {
			setUpdating(prev => {
				const next = new Set(prev);
				next.delete(update.id);
				return next;
			});
		}
	};

	const triggerBulkUpdate = async () => {
		setBulkUpdating(true);
		try {
			const response = await apiFetch('/api/wp/updates/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ update_ids: updates.map(u => u.id) }),
			});
			if (!response.ok) throw new Error('Bulk update failed');

			// Clear list after trigger
			setUpdates([]);
		} catch (err) {
			console.error('Error triggering bulk update:', err);
		} finally {
			setBulkUpdating(false);
		}
	};

	const typeColors: Record<string, string> = {
		core: 'bg-purple-100 text-purple-800',
		plugin: 'bg-blue-100 text-blue-800',
		theme: 'bg-teal-100 text-teal-800',
	};

	if (loading) {
		return (
			<div className='animate-pulse space-y-3'>
				{[...Array(5)].map((_, i) => (
					<div key={i} className='h-14 bg-gray-200 rounded'></div>
				))}
			</div>
		);
	}

	return (
		<div className='wp-updates-table'>
			<div className='flex justify-between items-center mb-4'>
				<h2 className='text-xl font-bold'>Pending WordPress Updates</h2>
				<div className='flex gap-2'>
					<button
						onClick={fetchUpdates}
						className='px-3 py-1.5 text-sm border rounded hover:bg-gray-50'
					>
						↻ Refresh
					</button>
					{updates.length > 0 && (
						<button
							onClick={triggerBulkUpdate}
							disabled={bulkUpdating}
							className='px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50'
						>
							{bulkUpdating ? 'Updating...' : `Update All (${updates.length})`}
						</button>
					)}
				</div>
			</div>

			{updates.length === 0 ? (
				<div className='text-center py-12 bg-gray-50 rounded-lg'>
					<span className='text-4xl'>✅</span>
					<p className='mt-2 text-gray-600'>All sites are up to date!</p>
				</div>
			) : (
				<div className='overflow-x-auto'>
					<table className='min-w-full divide-y divide-gray-200'>
						<thead className='bg-gray-50'>
							<tr>
								<th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
									Site
								</th>
								<th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
									Type
								</th>
								<th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
									Package
								</th>
								<th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
									Version
								</th>
								<th className='px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase'>
									Action
								</th>
							</tr>
						</thead>
						<tbody className='bg-white divide-y divide-gray-200'>
							{updates.map(update => (
								<tr key={update.id} className='hover:bg-gray-50'>
									<td className='px-4 py-3 whitespace-nowrap font-medium'>
										{update.project_name}
									</td>
									<td className='px-4 py-3 whitespace-nowrap'>
										<span
											className={`px-2 py-1 text-xs rounded-full ${typeColors[update.update_type] || 'bg-gray-100'}`}
										>
											{update.update_type}
										</span>
									</td>
									<td className='px-4 py-3 whitespace-nowrap'>
										{update.package_name}
									</td>
									<td className='px-4 py-3 whitespace-nowrap'>
										<span className='text-gray-500'>
											{update.current_version}
										</span>
										<span className='mx-2'>→</span>
										<span className='text-green-600 font-medium'>
											{update.available_version}
										</span>
									</td>
									<td className='px-4 py-3 whitespace-nowrap text-right'>
										<button
											onClick={() => triggerUpdate(update)}
											disabled={updating.has(update.id)}
											className='px-3 py-1 text-sm bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50'
										>
											{updating.has(update.id) ? '...' : 'Update'}
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

export default WPUpdatesTable;
