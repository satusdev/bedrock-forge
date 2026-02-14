/**
 * LocalDevPanel - Local Development Controls Component
 *
 * Provides UI for managing local DDEV development environment:
 * - Clone project from GitHub
 * - Start/Stop/Restart DDEV
 * - Show local status and URLs
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Monitor,
	Play,
	Square,
	RefreshCw,
	Download,
	ExternalLink,
	FolderOpen,
	Terminal,
	CheckCircle,
	XCircle,
	Loader2,
	Github,
	Code,
} from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/env';

interface LocalDevPanelProps {
	projectName: string;
	githubUrl?: string;
}

interface LocalStatus {
	exists: boolean;
	local_path: string | null;
	ddev_configured: boolean;
	ddev_running: boolean;
	ddev_url: string | null;
	php_version?: string;
	wp_version?: string;
}

const API_BASE = API_BASE_URL;

export default function LocalDevPanel({
	projectName,
	githubUrl,
}: LocalDevPanelProps) {
	const queryClient = useQueryClient();
	const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
	const [cloneBranch, setCloneBranch] = useState('main');

	// Fetch local status
	const {
		data: localStatus,
		isLoading,
		refetch,
	} = useQuery<LocalStatus>({
		queryKey: ['localStatus', projectName],
		queryFn: async () => {
			const response = await fetch(
				`${API_BASE}/projects/${projectName}/local-status`,
				{
					headers: {
						Authorization: `Bearer ${localStorage.getItem('token')}`,
					},
				}
			);
			if (!response.ok) throw new Error('Failed to fetch local status');
			return response.json();
		},
		refetchInterval: 30000, // Refresh every 30 seconds
	});

	// Clone to local mutation
	const cloneMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(
				`${API_BASE}/projects/${projectName}/clone-local`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${localStorage.getItem('token')}`,
					},
					body: JSON.stringify({
						github_url: githubUrl,
						branch: cloneBranch,
						run_composer: true,
						setup_ddev: true,
						start_after_setup: true,
					}),
				}
			);
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.detail || 'Clone failed');
			}
			return response.json();
		},
		onSuccess: data => {
			toast.success(`Clone started! Task ID: ${data.task_id}`);
			setCloneDialogOpen(false);
			// Start polling for task status
			setTimeout(() => refetch(), 5000);
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	// DDEV control mutations
	const ddevMutation = useMutation({
		mutationFn: async (action: 'start' | 'stop' | 'restart') => {
			const response = await fetch(
				`${API_BASE}/projects/${projectName}/ddev/${action}`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${localStorage.getItem('token')}`,
					},
				}
			);
			if (!response.ok) throw new Error(`DDEV ${action} failed`);
			return response.json();
		},
		onSuccess: (_, action) => {
			toast.success(`DDEV ${action} completed`);
			queryClient.invalidateQueries({ queryKey: ['localStatus', projectName] });
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	// Setup local mutation
	const setupMutation = useMutation({
		mutationFn: async () => {
			const response = await fetch(
				`${API_BASE}/projects/${projectName}/setup-local`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${localStorage.getItem('token')}`,
					},
					body: JSON.stringify({
						php_version: '8.1',
						docroot: 'web',
						start_after_setup: true,
					}),
				}
			);
			if (!response.ok) throw new Error('DDEV setup failed');
			return response.json();
		},
		onSuccess: () => {
			toast.success('DDEV setup complete!');
			queryClient.invalidateQueries({ queryKey: ['localStatus', projectName] });
		},
		onError: (error: Error) => {
			toast.error(error.message);
		},
	});

	if (isLoading) {
		return (
			<Card className='p-4'>
				<div className='flex items-center gap-2 text-gray-400'>
					<Loader2 className='w-4 h-4 animate-spin' />
					<span>Checking local status...</span>
				</div>
			</Card>
		);
	}

	const isRunning = localStatus?.ddev_running;
	const isConfigured = localStatus?.ddev_configured;
	const exists = localStatus?.exists;

	return (
		<Card className='p-4 space-y-4'>
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<Monitor className='w-5 h-5 text-blue-400' />
					<h3 className='font-semibold text-white'>Local Development</h3>
				</div>
				<Button
					variant='ghost'
					size='sm'
					onClick={() => refetch()}
					className='text-gray-400 hover:text-white'
				>
					<RefreshCw className='w-4 h-4' />
				</Button>
			</div>

			{/* Status Indicator */}
			<div className='flex items-center gap-3'>
				{exists ? (
					<>
						{isRunning ? (
							<Badge variant='success' className='flex items-center gap-1'>
								<CheckCircle className='w-3 h-3' />
								Running
							</Badge>
						) : isConfigured ? (
							<Badge variant='warning' className='flex items-center gap-1'>
								<Square className='w-3 h-3' />
								Stopped
							</Badge>
						) : (
							<Badge variant='secondary' className='flex items-center gap-1'>
								<Code className='w-3 h-3' />
								Not Configured
							</Badge>
						)}
					</>
				) : (
					<Badge variant='secondary' className='flex items-center gap-1'>
						<XCircle className='w-3 h-3' />
						Not Cloned
					</Badge>
				)}
			</div>

			{/* Local Path */}
			{localStatus?.local_path && (
				<div className='text-sm text-gray-400 flex items-center gap-2'>
					<FolderOpen className='w-4 h-4' />
					<code className='text-xs bg-gray-800 px-2 py-1 rounded'>
						{localStatus.local_path}
					</code>
				</div>
			)}

			{/* Local URL */}
			{localStatus?.ddev_url && isRunning && (
				<a
					href={localStatus.ddev_url}
					target='_blank'
					rel='noopener noreferrer'
					className='text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2'
				>
					<ExternalLink className='w-4 h-4' />
					{localStatus.ddev_url}
				</a>
			)}

			{/* Action Buttons */}
			<div className='flex flex-wrap gap-2 pt-2'>
				{!exists && githubUrl && (
					<Button
						variant='primary'
						size='sm'
						onClick={() => setCloneDialogOpen(true)}
						disabled={cloneMutation.isPending}
					>
						{cloneMutation.isPending ? (
							<Loader2 className='w-4 h-4 animate-spin mr-1' />
						) : (
							<Download className='w-4 h-4 mr-1' />
						)}
						Clone to Local
					</Button>
				)}

				{exists && !isConfigured && (
					<Button
						variant='primary'
						size='sm'
						onClick={() => setupMutation.mutate()}
						disabled={setupMutation.isPending}
					>
						{setupMutation.isPending ? (
							<Loader2 className='w-4 h-4 animate-spin mr-1' />
						) : (
							<Terminal className='w-4 h-4 mr-1' />
						)}
						Setup DDEV
					</Button>
				)}

				{isConfigured && !isRunning && (
					<Button
						variant='primary'
						size='sm'
						onClick={() => ddevMutation.mutate('start')}
						disabled={ddevMutation.isPending}
					>
						{ddevMutation.isPending ? (
							<Loader2 className='w-4 h-4 animate-spin mr-1' />
						) : (
							<Play className='w-4 h-4 mr-1' />
						)}
						Start
					</Button>
				)}

				{isRunning && (
					<>
						<Button
							variant='secondary'
							size='sm'
							onClick={() => ddevMutation.mutate('stop')}
							disabled={ddevMutation.isPending}
						>
							<Square className='w-4 h-4 mr-1' />
							Stop
						</Button>
						<Button
							variant='secondary'
							size='sm'
							onClick={() => ddevMutation.mutate('restart')}
							disabled={ddevMutation.isPending}
						>
							<RefreshCw className='w-4 h-4 mr-1' />
							Restart
						</Button>
					</>
				)}
			</div>

			{/* Clone Dialog */}
			{cloneDialogOpen && (
				<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
					<div className='bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 space-y-4'>
						<h3 className='text-lg font-semibold text-white'>Clone to Local</h3>

						<div className='space-y-2'>
							<label className='block text-sm text-gray-400'>GitHub URL</label>
							<input
								type='text'
								value={githubUrl || ''}
								disabled
								className='w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm'
							/>
						</div>

						<div className='space-y-2'>
							<label className='block text-sm text-gray-400'>Branch</label>
							<input
								type='text'
								value={cloneBranch}
								onChange={e => setCloneBranch(e.target.value)}
								className='w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm'
								placeholder='main'
							/>
						</div>

						<div className='flex justify-end gap-2 pt-2'>
							<Button
								variant='secondary'
								onClick={() => setCloneDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button
								variant='primary'
								onClick={() => cloneMutation.mutate()}
								disabled={cloneMutation.isPending}
							>
								{cloneMutation.isPending ? (
									<Loader2 className='w-4 h-4 animate-spin mr-1' />
								) : (
									<Github className='w-4 h-4 mr-1' />
								)}
								Clone & Setup
							</Button>
						</div>
					</div>
				</div>
			)}
		</Card>
	);
}
