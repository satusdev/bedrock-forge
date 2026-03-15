import React from 'react';
import { X, Terminal } from 'lucide-react';
import Button from './ui/Button';
import { SyncTaskSnapshot } from '../utils/syncLogStorage';

interface SyncTaskLogsModalProps {
	isOpen: boolean;
	onClose: () => void;
	title?: string;
	activeTaskId: string | null;
	activeStatus?: string;
	activeLogs?: string;
	history: SyncTaskSnapshot[];
}

const SyncTaskLogsModal: React.FC<SyncTaskLogsModalProps> = ({
	isOpen,
	onClose,
	title = 'Sync Logs',
	activeTaskId,
	activeStatus,
	activeLogs,
	history,
}) => {
	if (!isOpen) {
		return null;
	}

	const activeSnapshot =
		(activeTaskId && history.find(entry => entry.task_id === activeTaskId)) ||
		null;
	const displayedLogs = (activeLogs || activeSnapshot?.logs || '').trim();
	const displayedStatus = (activeStatus || activeSnapshot?.status || '').trim();

	return (
		<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4'>
			<div className='bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[88vh] flex flex-col'>
				<div className='flex items-center justify-between p-4 border-b'>
					<div className='flex items-center gap-2'>
						<Terminal className='w-5 h-5 text-gray-600' />
						<div>
							<h2 className='text-lg font-semibold text-gray-900'>{title}</h2>
							{activeTaskId && (
								<p className='text-xs text-gray-500'>
									Task: {activeTaskId}
									{displayedStatus ? ` • ${displayedStatus}` : ''}
								</p>
							)}
						</div>
					</div>
					<button
						onClick={onClose}
						className='text-gray-400 hover:text-gray-600 p-2 rounded-lg'
					>
						<X className='w-5 h-5' />
					</button>
				</div>

				<div className='grid grid-cols-1 lg:grid-cols-3 flex-1 min-h-0'>
					<div className='lg:col-span-2 bg-gray-900 text-gray-200 p-4 overflow-auto'>
						<pre className='text-xs whitespace-pre-wrap break-all'>
							{displayedLogs || 'No logs captured for this task yet.'}
						</pre>
					</div>
					<div className='border-l p-4 overflow-auto bg-gray-50'>
						<h3 className='text-sm font-semibold text-gray-900 mb-3'>
							Recent Sync Tasks
						</h3>
						<div className='space-y-2'>
							{history.length === 0 ? (
								<p className='text-xs text-gray-500'>No sync history yet.</p>
							) : (
								history.map(entry => (
									<div
										key={entry.task_id}
										className='rounded border bg-white p-2'
									>
										<div className='text-xs font-medium text-gray-900 break-all'>
											{entry.task_id}
										</div>
										<div className='text-[11px] text-gray-600'>
											{entry.status} • {entry.progress}%
										</div>
										<div className='text-[11px] text-gray-500 truncate'>
											{entry.message}
										</div>
										<div className='text-[10px] text-gray-400'>
											{new Date(entry.updated_at).toLocaleString()}
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</div>

				<div className='p-4 border-t bg-gray-50 flex justify-end'>
					<Button variant='secondary' onClick={onClose}>
						Close
					</Button>
				</div>
			</div>
		</div>
	);
};

export default SyncTaskLogsModal;
