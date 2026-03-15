import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Plus, CheckCircle, XCircle, Pause } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { queryKeys } from '@/services/queryKeys';
import { monitoringApi } from '@/services/monitoringApi';
import { createMonitoringColumns } from '@/pages/monitoring/columns';
import MonitorFormDialog from '@/pages/monitoring/MonitorFormDialog';
import type { CreateMonitorForm, Monitor } from '@/pages/monitoring/types';
import toast from 'react-hot-toast';

export default function Monitoring() {
	const [searchQuery, setSearchQuery] = useState('');
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [formData, setFormData] = useState<CreateMonitorForm>({
		name: '',
		url: '',
		monitor_type: 'uptime',
		interval_seconds: 300,
		timeout_seconds: 30,
	});
	const queryClient = useQueryClient();

	const { data: monitorsData, isLoading } = useQuery({
		queryKey: queryKeys.monitors.list(),
		queryFn: () => monitoringApi.getMonitors(),
	});

	const monitors = monitorsData?.data || [];

	const createMutation = useMutation({
		mutationFn: (data: CreateMonitorForm) => monitoringApi.createMonitor(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.monitors.all });
			setShowCreateModal(false);
			setFormData({
				name: '',
				url: '',
				monitor_type: 'uptime',
				interval_seconds: 300,
				timeout_seconds: 30,
			});
			toast.success('Monitor created');
		},
		onError: () => toast.error('Failed to create monitor'),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => monitoringApi.deleteMonitor(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.monitors.all });
			toast.success('Monitor deleted');
		},
		onError: () => toast.error('Failed to delete monitor'),
	});

	const pauseMutation = useMutation({
		mutationFn: (monitor: Monitor) =>
			monitor.is_active
				? monitoringApi.pauseMonitor(monitor.id)
				: monitoringApi.resumeMonitor(monitor.id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.monitors.all });
		},
		onError: () => toast.error('Failed to toggle monitor'),
	});

	const filteredMonitors = monitors.filter(
		m =>
			m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			m.url.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const columns = useMemo(
		() =>
			createMonitoringColumns({
				onTogglePause: monitor => pauseMutation.mutate(monitor),
				onDelete: monitor => {
					if (window.confirm('Delete this monitor?')) {
						deleteMutation.mutate(monitor.id);
					}
				},
			}),
		[deleteMutation, pauseMutation],
	);

	// Stats
	const upCount = monitors.filter(
		m => m.is_active && m.last_status === 'up',
	).length;
	const downCount = monitors.filter(
		m => m.is_active && m.last_status === 'down',
	).length;
	const pausedCount = monitors.filter(m => !m.is_active).length;

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Monitoring</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Track uptime and performance ({monitors.length} monitors)
					</p>
				</div>
				<Button variant='primary' onClick={() => setShowCreateModal(true)}>
					<Plus className='w-4 h-4 mr-2' />
					Add Monitor
				</Button>
			</div>

			{/* Stats */}
			<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
				<Card>
					<div className='flex items-center'>
						<div className='p-2 bg-green-100 rounded-lg'>
							<CheckCircle className='w-5 h-5 text-green-600' />
						</div>
						<div className='ml-3'>
							<p className='text-sm text-gray-500'>Up</p>
							<p className='text-lg font-semibold text-gray-900'>{upCount}</p>
						</div>
					</div>
				</Card>
				<Card>
					<div className='flex items-center'>
						<div className='p-2 bg-red-100 rounded-lg'>
							<XCircle className='w-5 h-5 text-red-600' />
						</div>
						<div className='ml-3'>
							<p className='text-sm text-gray-500'>Down</p>
							<p className='text-lg font-semibold text-gray-900'>{downCount}</p>
						</div>
					</div>
				</Card>
				<Card>
					<div className='flex items-center'>
						<div className='p-2 bg-gray-100 rounded-lg'>
							<Pause className='w-5 h-5 text-gray-600' />
						</div>
						<div className='ml-3'>
							<p className='text-sm text-gray-500'>Paused</p>
							<p className='text-lg font-semibold text-gray-900'>
								{pausedCount}
							</p>
						</div>
					</div>
				</Card>
			</div>

			{/* Monitors List */}
			{isLoading ? (
				<div className='flex items-center justify-center h-64'>
					<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
				</div>
			) : filteredMonitors.length === 0 ? (
				<Card>
					<div className='text-center py-12'>
						<Activity className='w-12 h-12 mx-auto mb-3 text-gray-300' />
						<h3 className='text-lg font-medium text-gray-900'>
							No Monitors Found
						</h3>
						<p className='mt-2 text-gray-500'>
							Add a monitor to start tracking uptime.
						</p>
					</div>
				</Card>
			) : (
				<Card>
					<DataTable
						columns={columns}
						data={filteredMonitors}
						filterValue={searchQuery}
						onFilterChange={setSearchQuery}
						filterPlaceholder='Search monitors by name or URL...'
						emptyMessage='No monitors found.'
						initialPageSize={10}
					/>
				</Card>
			)}

			<MonitorFormDialog
				open={showCreateModal}
				formData={formData}
				isPending={createMutation.isPending}
				onOpenChange={setShowCreateModal}
				onFormChange={setFormData}
				onSubmit={event => {
					event.preventDefault();
					createMutation.mutate(formData);
				}}
			/>
		</div>
	);
}
