import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, Download, Terminal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/api';
import websocketService, { WebSocketMessage } from '@/services/websocket';
import Button from './ui/Button';

interface TaskLogModalProps {
	isOpen: boolean;
	onClose: () => void;
	backupId: number;
	backupName?: string;
	isRunning?: boolean;
}

export default function TaskLogModal({
	isOpen,
	onClose,
	backupId,
	backupName = 'Backup',
	isRunning = false,
}: TaskLogModalProps) {
	const logsEndRef = useRef<HTMLDivElement>(null);
	const [wsConnected, setWsConnected] = useState(false);
	const [realtimeBackup, setRealtimeBackup] = useState<{
		status?: string;
		logs?: string;
		error_message?: string;
	} | null>(null);

	useEffect(() => {
		if (!isOpen || !backupId) {
			setRealtimeBackup(null);
			return;
		}

		let mounted = true;
		const handleMessage = (message: WebSocketMessage) => {
			if (message.type !== 'backup_update') {
				return;
			}
			if (Number((message as any).backup_id) !== backupId) {
				return;
			}

			setRealtimeBackup(prev => ({
				status:
					typeof (message as any).status === 'string'
						? (message as any).status
						: prev?.status,
				logs:
					typeof (message as any).logs === 'string'
						? (message as any).logs
						: typeof (message as any).log_line === 'string'
							? [prev?.logs, (message as any).log_line]
									.filter(Boolean)
									.join('\n')
							: prev?.logs,
				error_message:
					typeof (message as any).error_message === 'string'
						? (message as any).error_message
						: prev?.error_message,
			}));
		};

		const handleConnection = (message: WebSocketMessage) => {
			if (message.type !== 'connection') {
				return;
			}
			setWsConnected(message.status === 'connected');
		};

		websocketService.on('message', handleMessage);
		websocketService.on('connection', handleConnection);

		void websocketService.connect().then(() => {
			if (mounted) {
				setWsConnected(websocketService.isConnected());
			}
		});

		return () => {
			mounted = false;
			websocketService.off('message', handleMessage);
			websocketService.off('connection', handleConnection);
		};
	}, [isOpen, backupId]);

	// Poll logs if running
	const { data: backupData, isLoading } = useQuery({
		queryKey: ['backup-logs', backupId],
		queryFn: async () => {
			const response = await dashboardApi.getBackup(backupId);
			return response.data;
		},
		refetchInterval: (
			data,
			query?: { state?: { data?: { status?: string } } },
		) => {
			if (wsConnected) {
				return false;
			}
			const currentStatus = String(
				(data as { status?: string } | undefined)?.status ||
					query?.state?.data?.status ||
					'',
			).toLowerCase();
			if (
				isRunning ||
				currentStatus === 'pending' ||
				currentStatus === 'running' ||
				currentStatus === 'in_progress'
			) {
				return 2000;
			}
			return false;
		},
		enabled: isOpen && !!backupId,
	});

	const logs = realtimeBackup?.logs || backupData?.logs || 'No logs available.';
	const status = realtimeBackup?.status || backupData?.status;

	// Auto-scroll to bottom
	useEffect(() => {
		if (logsEndRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [logs, isOpen]);

	if (!isOpen) return null;

	return (
		<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200'>
			<div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col'>
				{/* Header */}
				<div className='flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700'>
					<div className='flex items-center gap-3'>
						<div className='w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400'>
							<Terminal className='w-5 h-5' />
						</div>
						<div>
							<h2 className='text-lg font-semibold text-gray-900 dark:text-white'>
								Task Logs: {backupName}
							</h2>
							<p className='text-xs text-gray-500 flex items-center gap-2'>
								ID: {backupId}
								{status && (
									<span
										className={`px-1.5 py-0.5 rounded-full text-[10px] uppercase font-bold
                                        ${
																					status === 'completed'
																						? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
																						: status === 'failed'
																							? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
																							: status === 'running' ||
																								  status === 'in_progress'
																								? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
																								: 'bg-gray-100 text-gray-700'
																				}
                                    `}
									>
										{String(status).replace('_', ' ')}
									</span>
								)}
							</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className='text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors'
					>
						<X className='w-5 h-5' />
					</button>
				</div>

				{/* Log Content */}
				<div className='flex-1 overflow-hidden bg-gray-900 p-4 font-mono text-sm text-gray-300'>
					<div className='h-full overflow-y-auto custom-scrollbar'>
						{isLoading ? (
							<div className='flex items-center justify-center h-full text-gray-500'>
								<Loader2 className='w-6 h-6 animate-spin mr-2' />
								Loading logs...
							</div>
						) : (
							<pre className='whitespace-pre-wrap break-all'>
								{logs}
								<div ref={logsEndRef} />
							</pre>
						)}
					</div>
				</div>

				{/* Footer */}
				<div className='p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl'>
					<Button variant='secondary' onClick={onClose}>
						Close
					</Button>
				</div>
			</div>
		</div>
	);
}
