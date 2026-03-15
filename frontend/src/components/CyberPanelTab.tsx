import React, { useState, useEffect } from 'react';
import {
	Globe,
	Shield,
	Database,
	RefreshCw,
	Plus,
	Trash2,
	Server,
	CheckCircle,
	XCircle,
	AlertCircle,
	Loader2,
	Settings,
	HardDrive,
} from 'lucide-react';
import { apiFetch } from '@/config/env';

interface Website {
	domain: string;
	status: string;
	php_version: string;
	ssl_enabled: boolean;
	storage_used: string;
	bandwidth_used: string;
}

interface DatabaseInfo {
	name: string;
	size: string;
	user: string;
}

interface CyberPanelTabProps {
	serverId: number;
	serverName: string;
}

const CyberPanelTab: React.FC<CyberPanelTabProps> = ({
	serverId,
	serverName,
}) => {
	const [websites, setWebsites] = useState<Website[]>([]);
	const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
	const [serverInfo, setServerInfo] = useState<any>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<
		'websites' | 'databases' | 'settings'
	>('websites');

	// Modal states
	const [showCreateWebsite, setShowCreateWebsite] = useState(false);
	const [showCreateDB, setShowCreateDB] = useState(false);

	// Form states
	const [newDomain, setNewDomain] = useState('');
	const [phpVersion, setPhpVersion] = useState('8.2');
	const [newDbName, setNewDbName] = useState('');
	const [newDbUser, setNewDbUser] = useState('');

	useEffect(() => {
		loadData();
	}, [serverId]);

	const loadData = async () => {
		setIsLoading(true);
		setError(null);

		try {
			// Load websites
			const websitesRes = await apiFetch(
				`/api/v1/cyberpanel/servers/${serverId}/websites`,
			);
			if (websitesRes.ok) {
				const data = await websitesRes.json();
				setWebsites(data.websites || []);
			}

			// Load databases
			const dbRes = await apiFetch(
				`/api/v1/cyberpanel/servers/${serverId}/databases`,
			);
			if (dbRes.ok) {
				const data = await dbRes.json();
				setDatabases(data.databases || []);
			}

			// Load server info
			const infoRes = await apiFetch(
				`/api/v1/cyberpanel/servers/${serverId}/info`,
			);
			if (infoRes.ok) {
				const data = await infoRes.json();
				setServerInfo(data);
			}
		} catch (err) {
			setError('Failed to load CyberPanel data');
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	const createWebsite = async () => {
		try {
			const res = await apiFetch(
				`/api/v1/cyberpanel/servers/${serverId}/websites`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ domain: newDomain, php_version: phpVersion }),
				},
			);

			if (res.ok) {
				setShowCreateWebsite(false);
				setNewDomain('');
				loadData();
			}
		} catch (err) {
			console.error('Failed to create website:', err);
		}
	};

	const issueSSL = async (domain: string) => {
		try {
			await apiFetch(`/api/v1/cyberpanel/servers/${serverId}/ssl/${domain}`, {
				method: 'POST',
			});
			loadData();
		} catch (err) {
			console.error('Failed to issue SSL:', err);
		}
	};

	const deleteWebsite = async (domain: string) => {
		if (!confirm(`Delete website ${domain}? This cannot be undone.`)) return;

		try {
			await apiFetch(
				`/api/v1/cyberpanel/servers/${serverId}/websites/${domain}`,
				{
					method: 'DELETE',
				},
			);
			loadData();
		} catch (err) {
			console.error('Failed to delete website:', err);
		}
	};

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<Loader2 className='w-8 h-8 animate-spin text-blue-500' />
				<span className='ml-2 text-gray-600'>Loading CyberPanel data...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className='bg-red-50 border border-red-200 rounded-lg p-4'>
				<div className='flex items-center text-red-700'>
					<AlertCircle className='w-5 h-5 mr-2' />
					{error}
				</div>
				<button
					onClick={loadData}
					className='mt-2 text-sm text-red-600 hover:underline'
				>
					Retry
				</button>
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center space-x-3'>
					<Server className='w-6 h-6 text-indigo-600' />
					<h2 className='text-xl font-semibold'>CyberPanel - {serverName}</h2>
				</div>
				<button
					onClick={loadData}
					className='flex items-center px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg'
				>
					<RefreshCw className='w-4 h-4 mr-2' />
					Refresh
				</button>
			</div>

			{/* Server Stats */}
			{serverInfo && (
				<div className='grid grid-cols-4 gap-4'>
					<div className='bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4'>
						<div className='text-sm text-blue-600'>CPU Usage</div>
						<div className='text-2xl font-bold text-blue-800'>
							{serverInfo.cpu_usage}%
						</div>
					</div>
					<div className='bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4'>
						<div className='text-sm text-green-600'>Memory</div>
						<div className='text-2xl font-bold text-green-800'>
							{serverInfo.memory_usage}%
						</div>
					</div>
					<div className='bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4'>
						<div className='text-sm text-purple-600'>Disk</div>
						<div className='text-2xl font-bold text-purple-800'>
							{serverInfo.disk_usage}%
						</div>
					</div>
					<div className='bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-4'>
						<div className='text-sm text-orange-600'>Websites</div>
						<div className='text-2xl font-bold text-orange-800'>
							{websites.length}
						</div>
					</div>
				</div>
			)}

			{/* Tab Navigation */}
			<div className='border-b border-gray-200'>
				<nav className='flex space-x-8'>
					{[
						{ id: 'websites', label: 'Websites', icon: Globe },
						{ id: 'databases', label: 'Databases', icon: Database },
						{ id: 'settings', label: 'Settings', icon: Settings },
					].map(tab => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id as any)}
							className={`flex items-center py-3 px-1 border-b-2 font-medium text-sm ${
								activeTab === tab.id
									? 'border-indigo-500 text-indigo-600'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
							}`}
						>
							<tab.icon className='w-4 h-4 mr-2' />
							{tab.label}
						</button>
					))}
				</nav>
			</div>

			{/* Websites Tab */}
			{activeTab === 'websites' && (
				<div className='space-y-4'>
					<div className='flex justify-end'>
						<button
							onClick={() => setShowCreateWebsite(true)}
							className='flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700'
						>
							<Plus className='w-4 h-4 mr-2' />
							Create Website
						</button>
					</div>

					<div className='bg-white rounded-lg border border-gray-200 overflow-hidden'>
						<table className='min-w-full divide-y divide-gray-200'>
							<thead className='bg-gray-50'>
								<tr>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
										Domain
									</th>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
										PHP
									</th>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
										SSL
									</th>
									<th className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
										Storage
									</th>
									<th className='px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider'>
										Actions
									</th>
								</tr>
							</thead>
							<tbody className='bg-white divide-y divide-gray-200'>
								{websites.map(site => (
									<tr key={site.domain} className='hover:bg-gray-50'>
										<td className='px-6 py-4 whitespace-nowrap'>
											<div className='flex items-center'>
												<Globe className='w-4 h-4 text-gray-400 mr-2' />
												<span className='font-medium text-gray-900'>
													{site.domain}
												</span>
											</div>
										</td>
										<td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
											PHP {site.php_version}
										</td>
										<td className='px-6 py-4 whitespace-nowrap'>
											{site.ssl_enabled ? (
												<span className='flex items-center text-green-600'>
													<CheckCircle className='w-4 h-4 mr-1' />
													Active
												</span>
											) : (
												<button
													onClick={() => issueSSL(site.domain)}
													className='flex items-center text-orange-600 hover:text-orange-800'
												>
													<Shield className='w-4 h-4 mr-1' />
													Issue SSL
												</button>
											)}
										</td>
										<td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
											{site.storage_used}
										</td>
										<td className='px-6 py-4 whitespace-nowrap text-right text-sm'>
											<button
												onClick={() => deleteWebsite(site.domain)}
												className='text-red-600 hover:text-red-800'
											>
												<Trash2 className='w-4 h-4' />
											</button>
										</td>
									</tr>
								))}
								{websites.length === 0 && (
									<tr>
										<td
											colSpan={5}
											className='px-6 py-8 text-center text-gray-500'
										>
											No websites found. Create your first website above.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Databases Tab */}
			{activeTab === 'databases' && (
				<div className='space-y-4'>
					<div className='flex justify-end'>
						<button
							onClick={() => setShowCreateDB(true)}
							className='flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700'
						>
							<Plus className='w-4 h-4 mr-2' />
							Create Database
						</button>
					</div>

					<div className='grid grid-cols-3 gap-4'>
						{databases.map(db => (
							<div
								key={db.name}
								className='bg-white border border-gray-200 rounded-lg p-4'
							>
								<div className='flex items-center justify-between'>
									<div className='flex items-center'>
										<Database className='w-5 h-5 text-indigo-500 mr-2' />
										<span className='font-medium'>{db.name}</span>
									</div>
									<HardDrive className='w-4 h-4 text-gray-400' />
								</div>
								<div className='mt-2 text-sm text-gray-500'>
									<div>User: {db.user}</div>
									<div>Size: {db.size}</div>
								</div>
							</div>
						))}
						{databases.length === 0 && (
							<div className='col-span-3 text-center py-8 text-gray-500'>
								No databases found.
							</div>
						)}
					</div>
				</div>
			)}

			{/* Create Website Modal */}
			{showCreateWebsite && (
				<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
					<div className='bg-white rounded-lg p-6 w-full max-w-md'>
						<h3 className='text-lg font-semibold mb-4'>Create Website</h3>
						<div className='space-y-4'>
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									Domain Name
								</label>
								<input
									type='text'
									value={newDomain}
									onChange={e => setNewDomain(e.target.value)}
									placeholder='example.com'
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500'
								/>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 mb-1'>
									PHP Version
								</label>
								<select
									value={phpVersion}
									onChange={e => setPhpVersion(e.target.value)}
									className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500'
								>
									<option value='8.3'>PHP 8.3</option>
									<option value='8.2'>PHP 8.2</option>
									<option value='8.1'>PHP 8.1</option>
									<option value='8.0'>PHP 8.0</option>
								</select>
							</div>
						</div>
						<div className='flex justify-end space-x-3 mt-6'>
							<button
								onClick={() => setShowCreateWebsite(false)}
								className='px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg'
							>
								Cancel
							</button>
							<button
								onClick={createWebsite}
								disabled={!newDomain}
								className='px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50'
							>
								Create
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default CyberPanelTab;
