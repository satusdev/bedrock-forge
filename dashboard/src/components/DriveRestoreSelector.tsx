import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { dashboardApi } from '@/services/api';

interface Environment {
	id: number;
	environment: string;
	server_id: number;
	server_name: string;
	wp_url: string;
}

interface DriveRestoreSelectorProps {
	projectId?: number;
	projectName?: string;
}

const DriveRestoreSelector: React.FC<DriveRestoreSelectorProps> = ({
	projectId,
	projectName,
}) => {
	const [driveEnv, setDriveEnv] = useState('');
	const [driveTimestamp, setDriveTimestamp] = useState('');
	const [targetEnvId, setTargetEnvId] = useState<number | ''>('');
	const [driveSourceUrl, setDriveSourceUrl] = useState('');
	const [driveTargetDomain, setDriveTargetDomain] = useState('');
	const [setShellUser, setSetShellUser] = useState('');
	const [runComposerInstall, setRunComposerInstall] = useState(true);
	const [runComposerUpdate, setRunComposerUpdate] = useState(false);
	const [runWpPluginUpdate, setRunWpPluginUpdate] = useState(false);
	const [dryRunClone, setDryRunClone] = useState(false);
	const [taskId, setTaskId] = useState<string | null>(null);
	const [taskStatus, setTaskStatus] = useState<any>(null);

	const { data: envData } = useQuery({
		queryKey: ['project-environments', projectId],
		queryFn: () => dashboardApi.getProjectEnvironments(projectId),
		enabled: !!projectId,
	});

	const { data: driveIndexData } = useQuery({
		queryKey: ['project-drive-backups-index', projectId],
		queryFn: () => dashboardApi.getProjectDriveBackupIndex(projectId),
		enabled: !!projectId,
	});

	const environments = (envData?.data || []) as Environment[];
	const driveIndex = driveIndexData?.data?.environments || {};

	const parseDomain = (url: string) => {
		try {
			return new URL(url).hostname;
		} catch {
			return url.replace(/^https?:\/\//, '').split('/')[0];
		}
	};

	const cloneFromDriveMutation = useMutation({
		mutationFn: () =>
			dashboardApi.cloneFromDrive({
				project_id: projectId,
				target_server_id: Number(targetEnvId),
				target_domain: driveTargetDomain,
				environment: driveEnv,
				backup_timestamp: driveTimestamp,
				source_url: driveSourceUrl || undefined,
				target_url: driveTargetDomain
					? `https://${driveTargetDomain}`
					: undefined,
				set_shell_user: setShellUser || undefined,
				run_composer_install: runComposerInstall,
				run_composer_update: runComposerUpdate,
				run_wp_plugin_update: runWpPluginUpdate,
				dry_run: dryRunClone,
			}),
		onSuccess: response => {
			setTaskId(response.data.task_id);
			toast.success(dryRunClone ? 'Dry-run started' : 'Restore started');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Restore failed to start');
		},
	});

	useEffect(() => {
		if (!taskId) return;
		const interval = setInterval(async () => {
			try {
				const response = await dashboardApi.getTaskStatus(taskId);
				setTaskStatus(response.data);
				if (['completed', 'failed'].includes(response.data.status)) {
					clearInterval(interval);
				}
			} catch {
				clearInterval(interval);
			}
		}, 2000);

		return () => clearInterval(interval);
	}, [taskId]);

	return (
		<Card title='Restore From Drive'>
			{!projectId ? (
				<div className='text-sm text-gray-500'>Select a project first.</div>
			) : (
				<div className='space-y-4'>
					<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
						<div>
							<label className='block text-sm font-medium mb-1'>
								Backup Environment
							</label>
							<select
								className='w-full border rounded-lg px-3 py-2'
								value={driveEnv}
								onChange={e => {
									const value = e.target.value;
									setDriveEnv(value);
									const envMatch = environments.find(
										env => env.environment === value
									);
									if (envMatch?.wp_url) {
										setDriveSourceUrl(envMatch.wp_url);
									}
									setDriveTimestamp('');
								}}
							>
								<option key='drive-env-default' value=''>Select environment</option>
								{Object.keys(driveIndex).map(env => (
									<option key={`drive-env-${env}`} value={env}>
										{env}
									</option>
								))}
							</select>
						</div>

						<div>
							<label className='block text-sm font-medium mb-1'>
								Backup Timestamp
							</label>
							<select
								className='w-full border rounded-lg px-3 py-2'
								value={driveTimestamp}
								onChange={e => setDriveTimestamp(e.target.value)}
								disabled={!driveEnv}
							>
								<option key='drive-timestamp-default' value=''>Select backup</option>
								{(driveIndex[driveEnv] || []).map((entry: any) => (
									<option key={`drive-timestamp-${entry.timestamp}`} value={entry.timestamp}>
										{entry.timestamp}
									</option>
								))}
							</select>
						</div>

						<div>
							<label className='block text-sm font-medium mb-1'>
								Target Environment
							</label>
							<select
								className='w-full border rounded-lg px-3 py-2'
								value={targetEnvId !== '' ? String(targetEnvId) : ''}
								onChange={e => {
									const val = e.target.value;
									const envId = val ? Number(val) : '';
									setTargetEnvId(envId);
									const envMatch = environments.find(env => env.id === envId);
									if (envMatch?.wp_url) {
										const domain = parseDomain(envMatch.wp_url);
										setDriveTargetDomain(domain);
										setSetShellUser(domain);
									}
								}}
							>
								<option key='drive-target-default' value=''>Select target</option>
								{environments.map(env => (
									<option key={`drive-target-${env.id}`} value={String(env.id)}>
										{env.environment} • {env.server_name}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
						<div>
							<label className='block text-sm font-medium mb-1'>
								Source URL (optional)
							</label>
							<input
								className='w-full border rounded-lg px-3 py-2'
								value={driveSourceUrl}
								onChange={e => setDriveSourceUrl(e.target.value)}
								placeholder='https://old-domain.com'
							/>
						</div>

						<div>
							<label className='block text-sm font-medium mb-1'>
								Target Domain
							</label>
							<input
								className='w-full border rounded-lg px-3 py-2'
								value={driveTargetDomain}
								onChange={e => {
									setDriveTargetDomain(e.target.value);
									setSetShellUser(e.target.value);
								}}
								placeholder='site.example.com'
							/>
						</div>

						<div>
							<label className='block text-sm font-medium mb-1'>
								System User
							</label>
							<input
								className='w-full border rounded-lg px-3 py-2'
								value={setShellUser}
								onChange={e => setSetShellUser(e.target.value)}
								placeholder='siteuser'
							/>
						</div>
					</div>

					<div className='space-y-2'>
						<label className='flex items-center gap-2 text-sm'>
							<input
								type='checkbox'
								checked={runComposerInstall}
								onChange={e => setRunComposerInstall(e.target.checked)}
							/>
							Run composer install
						</label>
						<label className='flex items-center gap-2 text-sm'>
							<input
								type='checkbox'
								checked={runComposerUpdate}
								onChange={e => setRunComposerUpdate(e.target.checked)}
							/>
							Run composer update
						</label>
						<label className='flex items-center gap-2 text-sm'>
							<input
								type='checkbox'
								checked={runWpPluginUpdate}
								onChange={e => setRunWpPluginUpdate(e.target.checked)}
							/>
							Update WP plugins
						</label>
						<label className='flex items-center gap-2 text-sm'>
							<input
								type='checkbox'
								checked={dryRunClone}
								onChange={e => setDryRunClone(e.target.checked)}
							/>
							Dry-run clone (download only)
						</label>
					</div>

					<div>
						<Button
							variant='primary'
							onClick={() => cloneFromDriveMutation.mutate()}
							disabled={
								!projectId ||
								!driveEnv ||
								!driveTimestamp ||
								!targetEnvId ||
								!driveTargetDomain ||
								cloneFromDriveMutation.isPending
							}
						>
							{cloneFromDriveMutation.isPending
								? 'Starting…'
								: dryRunClone
								? 'Dry-Run Clone'
								: 'Restore From Drive'}
						</Button>
					</div>

					{taskId && (
						<div className='text-sm text-gray-600'>
							Task: {taskId} • {taskStatus?.status || 'pending'} •{' '}
							{taskStatus?.message || 'Working...'}
						</div>
					)}

					{taskStatus?.result?.staged && (
						<div className='text-sm text-gray-600 space-y-1'>
							<div>DB: {taskStatus.result.staged.db?.path || 'N/A'}</div>
							<div>Files: {taskStatus.result.staged.files?.path || 'N/A'}</div>
						</div>
					)}
				</div>
			)}
		</Card>
	);
};

export default DriveRestoreSelector;
