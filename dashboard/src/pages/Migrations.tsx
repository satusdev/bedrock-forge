import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { dashboardApi } from '@/services/api';
import DriveRestoreSelector from '@/components/DriveRestoreSelector';
import { useTaskStatusPolling } from '@/hooks/useTaskStatusPolling';

const Tabs = ({ children }: { children: React.ReactNode }) => {
	const [activeTab, setActiveTab] = useState(0);
	const tabs = React.Children.toArray(children);

	return (
		<div>
			<div className='flex border-b border-gray-200 mb-4'>
				{tabs.map((tab: any, index) => (
					<button
						key={index}
						className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
							activeTab === index
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}
						onClick={() => setActiveTab(index)}
					>
						{tab.props.label}
					</button>
				))}
			</div>
			<div className='mt-4'>{tabs[activeTab]}</div>
		</div>
	);
};

const Tab = ({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) => {
	return <div className='space-y-4'>{children}</div>;
};

const Migrations: React.FC = () => {
	const [searchParams, setSearchParams] = useSearchParams();
	const [projectId, setProjectId] = useState<number | ''>('');
	const [projectServerId, setProjectServerId] = useState<number | ''>('');
	const [sourceUrl, setSourceUrl] = useState('');
	const [targetUrl, setTargetUrl] = useState('');
	const [backupBefore, setBackupBefore] = useState(true);
	const [downloadBackup, setDownloadBackup] = useState(true);
	const [dryRun, setDryRun] = useState(false);
	const [taskId, setTaskId] = useState<string | null>(null);
	const [taskStatus, setTaskStatus] = useState<any>(null);

	const { data: projectsData } = useQuery({
		queryKey: ['projects'],
		queryFn: dashboardApi.getProjects,
	});

	const { data: serversData } = useQuery({
		queryKey: ['project-servers', projectId],
		queryFn: () => dashboardApi.getProjectServers(Number(projectId)),
		enabled: !!projectId,
	});

	const projects = projectsData?.data || [];
	const projectServers = serversData?.data || [];
	const selectedProject = projects.find((p: any) => p.id === projectId);

	const selectedProjectName = useMemo(() => {
		if (!selectedProject) return null;
		return selectedProject.project_name || selectedProject.name;
	}, [selectedProject]);

	const runMigration = useMutation({
		mutationFn: () =>
			dashboardApi.runUrlMigration({
				project_server_id: Number(projectServerId),
				source_url: sourceUrl,
				target_url: targetUrl,
				backup_before: backupBefore,
				download_backup: downloadBackup,
				dry_run: dryRun,
			}),
		onSuccess: response => {
			setTaskId(response.data.task_id);
			toast.success('Migration started');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Migration failed to start');
		},
	});

	const { taskStatus: migrationTaskStatus } = useTaskStatusPolling(taskId);

	useEffect(() => {
		if (!migrationTaskStatus) return;
		setTaskStatus(migrationTaskStatus);
	}, [migrationTaskStatus]);

	useEffect(() => {
		const projectParam = searchParams.get('project_id');
		if (!projectParam) return;
		const parsedId = Number(projectParam);
		if (Number.isNaN(parsedId)) return;
		setProjectId(parsedId);
		setProjectServerId('');
	}, [searchParams]);

	const clearProjectSelection = () => {
		setProjectId('');
		setProjectServerId('');
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete('project_id');
		setSearchParams(nextParams);
	};

	return (
		<div className='space-y-6'>
			<h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
				Migrations
			</h1>

			{/* Project Selector - Always Visible */}
			<Card title='Select Project'>
				<div className='mb-4 text-sm text-gray-600'>
					Select a project to perform migration or restoration tasks.
				</div>
				<div className='max-w-md'>
					<label className='block text-sm font-medium mb-1'>Project</label>
					<select
						className='w-full border rounded-lg px-3 py-2'
						value={projectId !== '' ? String(projectId) : ''}
						onChange={e => {
							const val = e.target.value;
							setProjectId(val ? Number(val) : '');
							setProjectServerId('');
						}}
					>
						<option key='migration-project-default' value=''>
							Select project
						</option>
						{projects.map((p: any) => (
							<option key={`migration-project-${p.id}`} value={String(p.id)}>
								{p.name || p.project_name}
							</option>
						))}
					</select>
				</div>

				{/* Selected Project Info */}
				{selectedProjectName && (
					<div className='mt-4 flex items-center justify-between bg-blue-50 text-blue-800 border border-blue-100 rounded-lg px-4 py-2'>
						<span className='text-sm'>
							Active Project: <strong>{selectedProjectName}</strong>
						</span>
						<button
							className='text-sm text-blue-700 hover:text-blue-900 underline'
							onClick={clearProjectSelection}
						>
							Change Project
						</button>
					</div>
				)}
			</Card>

			{projectId ? (
				<Tabs>
					<Tab label='URL Migration'>
						<Card title='URL Migration / Search & Replace'>
							<div className='mb-4 p-4 bg-gray-50 rounded-md text-sm text-gray-600'>
								Use this tool to migrate a WordPress site from one URL to
								another within an environment. This runs a database search and
								replace.
							</div>

							<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
								<div>
									<label className='block text-sm font-medium mb-1'>
										Target Environment
									</label>
									<select
										className='w-full border rounded-lg px-3 py-2'
										value={
											projectServerId !== '' ? String(projectServerId) : ''
										}
										onChange={e => {
											const val = e.target.value;
											setProjectServerId(val ? Number(val) : '');
										}}
									>
										<option key='migration-server-default' value=''>
											Select environment
										</option>
										{projectServers.map((ps: any) => (
											<option
												key={`migration-server-${ps.id}`}
												value={String(ps.id)}
											>
												{ps.server_name || ps.server_id} • {ps.environment}
											</option>
										))}
									</select>
								</div>

								<div className='col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4'>
									<div>
										<label className='block text-sm font-medium mb-1'>
											Old URL
										</label>
										<input
											className='w-full border rounded-lg px-3 py-2'
											value={sourceUrl}
											onChange={e => setSourceUrl(e.target.value)}
											placeholder='https://old-domain.com'
										/>
									</div>

									<div>
										<label className='block text-sm font-medium mb-1'>
											New URL
										</label>
										<input
											className='w-full border rounded-lg px-3 py-2'
											value={targetUrl}
											onChange={e => setTargetUrl(e.target.value)}
											placeholder='https://new-domain.com'
										/>
									</div>
								</div>
							</div>

							<div className='mt-6 space-y-3 border-t pt-4'>
								<label className='flex items-center gap-2 text-sm'>
									<input
										type='checkbox'
										checked={backupBefore}
										onChange={e => setBackupBefore(e.target.checked)}
										className='rounded text-blue-600 focus:ring-blue-500'
									/>
									Backup database before migration
								</label>
								<label className='flex items-center gap-2 text-sm'>
									<input
										type='checkbox'
										checked={downloadBackup}
										onChange={e => setDownloadBackup(e.target.checked)}
										className='rounded text-blue-600 focus:ring-blue-500'
									/>
									Download backup locally
								</label>
								<label className='flex items-center gap-2 text-sm'>
									<input
										type='checkbox'
										checked={dryRun}
										onChange={e => setDryRun(e.target.checked)}
										className='rounded text-blue-600 focus:ring-blue-500'
									/>
									Dry run (simulate changes)
								</label>
							</div>

							<div className='mt-6'>
								<Button
									variant='primary'
									onClick={() => runMigration.mutate()}
									disabled={
										!projectServerId ||
										!sourceUrl ||
										!targetUrl ||
										runMigration.isPending
									}
								>
									{runMigration.isPending ? 'Processing...' : 'Run Migration'}
								</Button>
							</div>

							{taskId && (
								<div className='mt-4 p-4 bg-gray-50 rounded-lg'>
									<div className='text-sm font-medium text-gray-900 mb-1'>
										Migration Status
									</div>
									<div className='text-sm text-gray-600'>
										Task ID: <span className='font-mono text-xs'>{taskId}</span>
									</div>
									<div className='text-sm mt-1'>
										Status:{' '}
										<span
											className={`font-semibold ${
												taskStatus?.status === 'completed'
													? 'text-green-600'
													: taskStatus?.status === 'failed'
													? 'text-red-600'
													: 'text-blue-600'
											}`}
										>
											{taskStatus?.status || 'pending'}
										</span>
									</div>
									<div className='text-sm text-gray-600 mt-1'>
										{taskStatus?.message || 'Initiating...'}
									</div>
								</div>
							)}
						</Card>
					</Tab>

					<Tab label='Restore from Drive'>
						<DriveRestoreSelector
							projectId={projectId || undefined}
							projectName={
								selectedProject?.project_name || selectedProject?.name
							}
						/>
					</Tab>
				</Tabs>
			) : (
				<div className='flex flex-col items-center justify-center p-12 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg text-center'>
					<div className='text-gray-400 mb-4'>
						<svg
							className='w-16 h-16 mx-auto'
							fill='none'
							viewBox='0 0 24 24'
							stroke='currentColor'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								strokeWidth={1.5}
								d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
							/>
						</svg>
					</div>
					<h3 className='text-lg font-medium text-gray-900 mb-1'>
						No Project Selected
					</h3>
					<p className='text-gray-500 max-w-sm'>
						Please select a project above to view available migration and
						restoration tools.
					</p>
				</div>
			)}
		</div>
	);
};

export default Migrations;
