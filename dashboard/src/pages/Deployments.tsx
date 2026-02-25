import React, { useState, useEffect, useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
	Play,
	RotateCcw,
	Clock,
	CheckCircle,
	XCircle,
	AlertTriangle,
	ArrowRight,
} from 'lucide-react';
import { dashboardApi } from '../services/api';
import DataTable from '../components/ui/DataTable';
import toast from 'react-hot-toast';

interface DeploymentHistoryItem {
	id: number;
	details?: string;
	timestamp: string;
	status: string;
}

const Deployments: React.FC = () => {
	const [activeTab, setActiveTab] = useState<'promote' | 'history'>('promote');
	const [isDeploying, setIsDeploying] = useState(false);
	const [history, setHistory] = useState<DeploymentHistoryItem[]>([]);

	// Form State
	const [stagingHost, setStagingHost] = useState('staging.example.com');
	const [stagingUser, setStagingUser] = useState('forge');
	const [prodHost, setProdHost] = useState('example.com');
	const [prodUser, setProdUser] = useState('forge');
	const [stagingUrl, setStagingUrl] = useState('https://staging.example.com');
	const [prodUrl, setProdUrl] = useState('https://example.com');

	useEffect(() => {
		if (activeTab === 'history') {
			loadHistory();
		}
	}, [activeTab]);

	const loadHistory = async () => {
		try {
			const res = await dashboardApi.getDeploymentHistory();
			setHistory(res.data);
		} catch (error) {
			console.error(error);
			toast.error('Failed to load deployment history');
		}
	};

	const handlePromote = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsDeploying(true);
		try {
			await dashboardApi.promoteDeployment({
				staging_host: stagingHost,
				staging_user: stagingUser,
				prod_host: prodHost,
				prod_user: prodUser,
				staging_url: stagingUrl,
				prod_url: prodUrl,
			});
			toast.success('Promotion started! Check history/logs.');
			setActiveTab('history');
		} catch (error) {
			console.error(error);
			toast.error('Promotion failed to start');
		} finally {
			setIsDeploying(false);
		}
	};

	const historyColumns = useMemo<ColumnDef<DeploymentHistoryItem>[]>(
		() => [
			{
				id: 'details',
				header: 'Details',
				cell: ({ row }) => (
					<span className='text-sm text-gray-600 dark:text-gray-300 font-mono'>
						{row.original.details?.slice(0, 50) || '-'}...
					</span>
				),
			},
			{
				id: 'date',
				header: 'Date',
				cell: ({ row }) => (
					<span className='text-sm text-gray-600 dark:text-gray-300'>
						{new Date(row.original.timestamp).toLocaleString()}
					</span>
				),
			},
			{
				id: 'status',
				header: 'Status',
				cell: ({ row }) => (
					<span
						className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
							row.original.status === 'success'
								? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
								: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
						}`}
					>
						{row.original.status === 'success' ? (
							<CheckCircle className='h-3 w-3' />
						) : (
							<XCircle className='h-3 w-3' />
						)}
						{row.original.status.toUpperCase()}
					</span>
				),
			},
			{
				id: 'action',
				header: 'Action',
				cell: () => (
					<button
						className='text-gray-400 hover:text-indigo-600 transition-colors'
						title='Rollback to this version'
					>
						<RotateCcw className='h-4 w-4' />
					</button>
				),
			},
		],
		[],
	);

	return (
		<div className='space-y-6'>
			<div className='flex justify-between items-center'>
				<h1 className='text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
					<Play className='h-6 w-6 text-indigo-600' />
					Deployment Center
				</h1>
				<div className='flex gap-2'>
					<button
						onClick={() => setActiveTab('promote')}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
							activeTab === 'promote'
								? 'bg-indigo-600 text-white'
								: 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
						}`}
					>
						Promote
					</button>
					<button
						onClick={() => setActiveTab('history')}
						className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
							activeTab === 'history'
								? 'bg-indigo-600 text-white'
								: 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
						}`}
					>
						History
					</button>
				</div>
			</div>

			{activeTab === 'promote' ? (
				<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
					{/* Staging Source */}
					<div className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6'>
						<h2 className='text-lg font-semibold mb-4 text-indigo-600 flex items-center gap-2'>
							<span className='bg-indigo-100 p-1 rounded'>1</span> Source:
							Staging
						</h2>
						<div className='space-y-4'>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Staging Host
								</label>
								<input
									type='text'
									value={stagingHost}
									onChange={e => setStagingHost(e.target.value)}
									className='w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500'
								/>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Staging User
								</label>
								<input
									type='text'
									value={stagingUser}
									onChange={e => setStagingUser(e.target.value)}
									className='w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500'
								/>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Staging URL
								</label>
								<input
									type='text'
									value={stagingUrl}
									onChange={e => setStagingUrl(e.target.value)}
									className='w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500'
								/>
							</div>
						</div>
					</div>

					{/* Production Target */}
					<div className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6'>
						<h2 className='text-lg font-semibold mb-4 text-green-600 flex items-center gap-2'>
							<span className='bg-green-100 p-1 rounded'>2</span> Target:
							Production
						</h2>
						<div className='space-y-4'>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Production Host
								</label>
								<input
									type='text'
									value={prodHost}
									onChange={e => setProdHost(e.target.value)}
									className='w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-green-500'
								/>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Production User
								</label>
								<input
									type='text'
									value={prodUser}
									onChange={e => setProdUser(e.target.value)}
									className='w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-green-500'
								/>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Production URL
								</label>
								<input
									type='text'
									value={prodUrl}
									onChange={e => setProdUrl(e.target.value)}
									className='w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:ring-2 focus:ring-green-500'
								/>
							</div>
						</div>
					</div>

					{/* Action Panel */}
					<div className='lg:col-span-2 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-xl p-8 text-center border border-gray-200 dark:border-gray-700'>
						<h3 className='text-xl font-bold mb-2 text-gray-900 dark:text-white'>
							Ready to Promote?
						</h3>
						<p className='text-gray-500 dark:text-gray-400 mb-6 max-w-2xl mx-auto'>
							This will copy files and database from Staging to Production, run
							a search-replace for URLs, and flush all caches. This action
							cannot be easily undone without a backup restore.
						</p>

						<div className='flex justify-center items-center gap-4'>
							<div className='text-right'>
								<div className='text-sm font-medium text-gray-500'>From</div>
								<div className='font-mono text-gray-900 dark:text-gray-200'>
									{stagingUrl}
								</div>
							</div>
							<ArrowRight className='text-gray-400' />
							<div className='text-left'>
								<div className='text-sm font-medium text-gray-500'>To</div>
								<div className='font-mono text-gray-900 dark:text-gray-200'>
									{prodUrl}
								</div>
							</div>
						</div>

						<button
							onClick={handlePromote}
							disabled={isDeploying}
							className={`mt-8 px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-3 mx-auto transition-all transform hover:scale-105 ${
								isDeploying
									? 'bg-gray-400 cursor-not-allowed'
									: 'bg-indigo-600 hover:bg-indigo-700 text-white'
							}`}
						>
							{isDeploying ? (
								<RotateCcw className='animate-spin h-6 w-6' />
							) : (
								<Play className='h-6 w-6' />
							)}
							{isDeploying ? 'Promoting...' : 'Start Promotion'}
						</button>
					</div>
				</div>
			) : (
				<div className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden'>
					<DataTable
						columns={historyColumns}
						data={history}
						showFilter={false}
						filterValue=''
						onFilterChange={() => {}}
						filterPlaceholder=''
						emptyMessage='No deployments found.'
						initialPageSize={10}
					/>
				</div>
			)}
		</div>
	);
};

export default Deployments;
