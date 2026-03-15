import { useParams, useNavigate } from '@/router/compat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import {
	Server as ServerIcon,
	CheckCircle,
	XCircle,
	AlertTriangle,
	RefreshCw,
	HardDrive,
	Cpu,
	Activity,
	Globe,
	Database,
	ArrowRight,
	Download,
	Users,
	Plus,
	Trash2,
	Key,
	Eye,
	EyeOff,
	Copy,
	UserPlus,
	Ban,
	CheckCircle2,
	Settings,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import DataTable from '../components/ui/DataTable';
import api, { dashboardApi } from '../services/api';
import toast from 'react-hot-toast';
import React, { useState } from 'react';

// Panel Login Modal
function PanelLoginModal({
	panelData,
	onClose,
}: {
	panelData: {
		panel_url: string;
		login_url: string;
		username: string;
		password: string;
		panel_type: string;
		session_url?: string | null;
		session_token?: string | null;
	};
	onClose: () => void;
}) {
	const [showPassword, setShowPassword] = useState(false);
	const [copied, setCopied] = useState<'user' | 'pass' | null>(null);

	const copyToClipboard = (text: string, type: 'user' | 'pass') => {
		navigator.clipboard.writeText(text);
		setCopied(type);
		setTimeout(() => setCopied(null), 2000);
		toast.success(`${type === 'user' ? 'Username' : 'Password'} copied!`);
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg shadow-xl max-w-md w-full mx-4'>
				<div className='p-6 border-b'>
					<h2 className='text-xl font-semibold flex items-center'>
						<Settings className='w-5 h-5 mr-2' />
						Panel Login Credentials
					</h2>
				</div>

				<div className='p-6 space-y-4'>
					<div className='p-4 bg-yellow-50 border border-yellow-200 rounded-lg'>
						<p className='text-sm text-yellow-800'>
							⚠️ These are sensitive credentials. Make sure no one is watching
							your screen.
						</p>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Panel URL
						</label>
						<a
							href={panelData.login_url}
							target='_blank'
							rel='noopener noreferrer'
							className='text-blue-600 hover:underline flex items-center'
						>
							{panelData.panel_url}
							<Globe className='w-4 h-4 ml-1' />
						</a>
					</div>

					{panelData.session_url && (
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								Session URL
							</label>
							<a
								href={panelData.session_url}
								target='_blank'
								rel='noopener noreferrer'
								className='text-blue-600 hover:underline flex items-center'
							>
								Open session
								<Globe className='w-4 h-4 ml-1' />
							</a>
						</div>
					)}

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Username
						</label>
						<div className='flex items-center space-x-2'>
							<code className='flex-1 px-3 py-2 bg-gray-100 rounded font-mono text-sm'>
								{panelData.username}
							</code>
							<Button
								variant='outline'
								size='sm'
								onClick={() => copyToClipboard(panelData.username, 'user')}
							>
								{copied === 'user' ? (
									<CheckCircle2 className='w-4 h-4 text-green-500' />
								) : (
									<Copy className='w-4 h-4' />
								)}
							</Button>
						</div>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Password
						</label>
						<div className='flex items-center space-x-2'>
							<div className='relative flex-1'>
								<code className='block w-full px-3 py-2 bg-gray-100 rounded font-mono text-sm'>
									{showPassword ? panelData.password : '••••••••••••'}
								</code>
							</div>
							<Button
								variant='outline'
								size='sm'
								onClick={() => setShowPassword(!showPassword)}
							>
								{showPassword ? (
									<EyeOff className='w-4 h-4' />
								) : (
									<Eye className='w-4 h-4' />
								)}
							</Button>
							<Button
								variant='outline'
								size='sm'
								onClick={() => copyToClipboard(panelData.password, 'pass')}
							>
								{copied === 'pass' ? (
									<CheckCircle2 className='w-4 h-4 text-green-500' />
								) : (
									<Copy className='w-4 h-4' />
								)}
							</Button>
						</div>
					</div>

					<div className='pt-4 flex justify-between'>
						<Button variant='secondary' onClick={onClose}>
							Close
						</Button>
						<Button onClick={() => window.open(panelData.login_url, '_blank')}>
							Open Panel <Globe className='w-4 h-4 ml-2' />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

// Tab type
type TabType = 'overview' | 'websites' | 'databases' | 'users';

// CyberPanel User type
interface CyberPanelUser {
	id: number;
	server_id: number;
	username: string;
	email: string;
	first_name: string | null;
	last_name: string | null;
	full_name: string;
	user_type: string;
	acl_name: string | null;
	status: string;
	has_password: boolean;
	password_set_at: string | null;
	synced_from_panel: boolean;
	last_synced_at: string | null;
	package_name: string | null;
	limits: {
		websites: { limit: number; used: number };
		disk_mb: { limit: number; used: number; percent: number | null };
		bandwidth_mb: { limit: number; used: number; percent: number | null };
		databases: { limit: number; used: number };
	};
	is_over_quota: boolean;
	notes: string | null;
	created_at: string | null;
}

interface WebsiteItem {
	domain: string;
	adminEmail?: string;
	phpSelection?: string;
	state?: string;
}

interface DatabaseItem {
	dbName: string;
	dbUser?: string;
	website?: string;
	size_bytes?: number;
}

// Create User Modal
function CreateUserModal({
	serverId,
	onClose,
	onSuccess,
}: {
	serverId: number;
	onClose: () => void;
	onSuccess: (user: any, password: string) => void;
}) {
	const [formData, setFormData] = useState({
		username: '',
		email: '',
		password: '',
		first_name: '',
		last_name: '',
		user_type: 'user',
		websites_limit: 0,
		disk_limit: 0,
		bandwidth_limit: 0,
		notes: '',
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [generatePassword, setGeneratePassword] = useState(true);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			const payload = {
				...formData,
				password: generatePassword ? undefined : formData.password,
			};

			const response = await api.post(
				`/cyberpanel/servers/${serverId}/users`,
				payload,
			);

			if (response.data?.status === 'success') {
				onSuccess(response.data.user, response.data.user.password);
			}
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Failed to create user');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto'>
				<div className='p-6 border-b'>
					<h2 className='text-xl font-semibold flex items-center'>
						<UserPlus className='w-5 h-5 mr-2' />
						Create CyberPanel User
					</h2>
				</div>

				<form onSubmit={handleSubmit} className='p-6 space-y-4'>
					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Username *
						</label>
						<input
							type='text'
							required
							pattern='[a-zA-Z0-9_]+'
							minLength={3}
							maxLength={50}
							value={formData.username}
							onChange={e =>
								setFormData({ ...formData, username: e.target.value })
							}
							className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							placeholder='username'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Email *
						</label>
						<input
							type='email'
							required
							value={formData.email}
							onChange={e =>
								setFormData({ ...formData, email: e.target.value })
							}
							className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							placeholder='user@example.com'
						/>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								First Name
							</label>
							<input
								type='text'
								value={formData.first_name}
								onChange={e =>
									setFormData({ ...formData, first_name: e.target.value })
								}
								className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								Last Name
							</label>
							<input
								type='text'
								value={formData.last_name}
								onChange={e =>
									setFormData({ ...formData, last_name: e.target.value })
								}
								className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							User Type
						</label>
						<select
							value={formData.user_type}
							onChange={e =>
								setFormData({ ...formData, user_type: e.target.value })
							}
							className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
						>
							<option value='user'>User</option>
							<option value='reseller'>Reseller</option>
							<option value='admin'>Admin</option>
						</select>
					</div>

					<div>
						<label className='flex items-center space-x-2 text-sm'>
							<input
								type='checkbox'
								checked={generatePassword}
								onChange={e => setGeneratePassword(e.target.checked)}
								className='rounded'
							/>
							<span>Generate secure password automatically</span>
						</label>
					</div>

					{!generatePassword && (
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								Password *
							</label>
							<input
								type='password'
								required={!generatePassword}
								minLength={8}
								value={formData.password}
								onChange={e =>
									setFormData({ ...formData, password: e.target.value })
								}
								className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
								placeholder='Minimum 8 characters'
							/>
						</div>
					)}

					<div className='grid grid-cols-3 gap-4'>
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								Websites Limit
							</label>
							<input
								type='number'
								min={0}
								value={formData.websites_limit}
								onChange={e =>
									setFormData({
										...formData,
										websites_limit: parseInt(e.target.value) || 0,
									})
								}
								className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							/>
							<span className='text-xs text-gray-500'>0 = unlimited</span>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								Disk (MB)
							</label>
							<input
								type='number'
								min={0}
								value={formData.disk_limit}
								onChange={e =>
									setFormData({
										...formData,
										disk_limit: parseInt(e.target.value) || 0,
									})
								}
								className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
						<div>
							<label className='block text-sm font-medium text-gray-700 mb-1'>
								BW (MB)
							</label>
							<input
								type='number'
								min={0}
								value={formData.bandwidth_limit}
								onChange={e =>
									setFormData({
										...formData,
										bandwidth_limit: parseInt(e.target.value) || 0,
									})
								}
								className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							/>
						</div>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Notes
						</label>
						<textarea
							value={formData.notes}
							onChange={e =>
								setFormData({ ...formData, notes: e.target.value })
							}
							rows={2}
							className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
						/>
					</div>

					<div className='flex justify-end space-x-3 pt-4'>
						<Button type='button' variant='secondary' onClick={onClose}>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isSubmitting ? 'Creating...' : 'Create User'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}

// Password Display Modal
function PasswordDisplayModal({
	username,
	password,
	onClose,
}: {
	username: string;
	password: string;
	onClose: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const copyPassword = () => {
		navigator.clipboard.writeText(password);
		setCopied(true);
		toast.success('Password copied to clipboard');
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg shadow-xl max-w-md w-full mx-4'>
				<div className='p-6 border-b bg-green-50'>
					<h2 className='text-xl font-semibold flex items-center text-green-800'>
						<CheckCircle2 className='w-5 h-5 mr-2' />
						User Created Successfully
					</h2>
				</div>

				<div className='p-6 space-y-4'>
					<div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4'>
						<p className='text-yellow-800 text-sm font-medium'>
							⚠️ Save this password now!
						</p>
						<p className='text-yellow-700 text-sm'>
							This is the only time the password will be shown.
						</p>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Username
						</label>
						<p className='text-lg font-mono bg-gray-50 px-3 py-2 rounded'>
							{username}
						</p>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Password
						</label>
						<div className='flex items-center space-x-2'>
							<code className='flex-1 text-lg bg-gray-50 px-3 py-2 rounded font-mono'>
								{password}
							</code>
							<Button variant='secondary' size='sm' onClick={copyPassword}>
								{copied ? (
									<CheckCircle2 className='w-4 h-4 text-green-500' />
								) : (
									<Copy className='w-4 h-4' />
								)}
							</Button>
						</div>
					</div>

					<div className='flex justify-end pt-4'>
						<Button onClick={onClose}>I've Saved the Password</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

// Create Database Modal
function CreateDatabaseModal({
	serverId,
	websites,
	onClose,
	onSuccess,
}: {
	serverId: number;
	websites: any[];
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [formData, setFormData] = useState({
		domain: '',
		db_name: '',
		db_user: '',
		db_password: '',
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	// Generate random password
	const generatePassword = () => {
		const chars =
			'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
		let password = '';
		for (let i = 0; i < 16; i++) {
			password += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		setFormData({ ...formData, db_password: password });
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);

		try {
			await dashboardApi.createCyberPanelDatabase(serverId, formData);
			onSuccess();
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Failed to create database');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto'>
				<div className='p-6 border-b'>
					<h2 className='text-xl font-semibold flex items-center'>
						<Database className='w-5 h-5 mr-2' />
						Create MySQL Database
					</h2>
				</div>

				<form onSubmit={handleSubmit} className='p-6 space-y-4'>
					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Website *
						</label>
						<select
							required
							value={formData.domain}
							onChange={e =>
								setFormData({ ...formData, domain: e.target.value })
							}
							className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
						>
							<option value=''>Select a website...</option>
							{websites.map((site: any) => (
								<option key={site.domain} value={site.domain}>
									{site.domain}
								</option>
							))}
						</select>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Database Name *
						</label>
						<input
							type='text'
							required
							pattern='[a-zA-Z0-9_]+'
							minLength={3}
							maxLength={64}
							value={formData.db_name}
							onChange={e =>
								setFormData({ ...formData, db_name: e.target.value })
							}
							className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							placeholder='my_database'
						/>
						<span className='text-xs text-gray-500'>
							Letters, numbers, and underscores only
						</span>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Database User *
						</label>
						<input
							type='text'
							required
							pattern='[a-zA-Z0-9_]+'
							minLength={3}
							maxLength={32}
							value={formData.db_user}
							onChange={e =>
								setFormData({ ...formData, db_user: e.target.value })
							}
							className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
							placeholder='db_user'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-700 mb-1'>
							Password *
						</label>
						<div className='flex space-x-2'>
							<div className='relative flex-1'>
								<input
									type={showPassword ? 'text' : 'password'}
									required
									minLength={8}
									value={formData.db_password}
									onChange={e =>
										setFormData({ ...formData, db_password: e.target.value })
									}
									className='w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10'
									placeholder='Strong password'
								/>
								<button
									type='button'
									onClick={() => setShowPassword(!showPassword)}
									className='absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600'
								>
									{showPassword ? (
										<EyeOff className='w-4 h-4' />
									) : (
										<Eye className='w-4 h-4' />
									)}
								</button>
							</div>
							<Button
								type='button'
								variant='outline'
								onClick={generatePassword}
							>
								<Key className='w-4 h-4' />
							</Button>
						</div>
					</div>

					<div className='flex justify-end space-x-3 pt-4'>
						<Button type='button' variant='secondary' onClick={onClose}>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isSubmitting ? 'Creating...' : 'Create Database'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}

export default function ServerDetail() {
	const { serverId } = useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<TabType>('overview');
	const [showCreateUserModal, setShowCreateUserModal] = useState(false);
	const [newUserPassword, setNewUserPassword] = useState<{
		username: string;
		password: string;
	} | null>(null);
	const [revealingPassword, setRevealingPassword] = useState<string | null>(
		null,
	);
	const [revealedPasswords, setRevealedPasswords] = useState<
		Record<string, string>
	>({});
	const [showCreateDatabaseModal, setShowCreateDatabaseModal] = useState(false);
	const [showPanelLoginModal, setShowPanelLoginModal] = useState(false);
	const [panelLoginData, setPanelLoginData] = useState<{
		panel_url: string;
		login_url: string;
		username: string;
		password: string;
		panel_type: string;
	} | null>(null);
	const [loadingPanelLogin, setLoadingPanelLogin] = useState(false);

	// Fetch server details
	const { data: serverData, isLoading } = useQuery({
		queryKey: ['server', serverId],
		queryFn: () => dashboardApi.getServer(Number(serverId)),
		enabled: !!serverId,
	});

	// Fetch CyberPanel websites (for sync)
	const {
		data: websitesData,
		refetch: refetchWebsites,
		isFetching: isFetchingWebsites,
	} = useQuery({
		queryKey: ['server-websites', serverId],
		queryFn: () => dashboardApi.getCyberPanelWebsites(Number(serverId)),
		enabled: !!serverId && serverData?.data?.panel_type === 'cyberpanel',
	});

	// Fetch CyberPanel users
	const {
		data: usersData,
		refetch: refetchUsers,
		isFetching: isFetchingUsers,
	} = useQuery({
		queryKey: ['server-users', serverId],
		queryFn: () => api.get(`/cyberpanel/servers/${serverId}/users?sync=false`),
		enabled:
			!!serverId &&
			serverData?.data?.panel_type === 'cyberpanel' &&
			activeTab === 'users',
	});

	// Fetch CyberPanel databases
	const {
		data: databasesData,
		refetch: refetchDatabases,
		isFetching: isFetchingDatabases,
	} = useQuery({
		queryKey: ['server-databases', serverId],
		queryFn: () => dashboardApi.getCyberPanelDatabases(Number(serverId)),
		enabled:
			!!serverId &&
			serverData?.data?.panel_type === 'cyberpanel' &&
			activeTab === 'databases',
	});

	const server = serverData?.data;
	const websites: WebsiteItem[] = websitesData?.data?.websites || [];
	const users: CyberPanelUser[] = usersData?.data?.users || [];
	const databases: DatabaseItem[] = databasesData?.data?.databases || [];

	// Sync users from CyberPanel
	const syncUsers = async () => {
		try {
			await api.get(`/cyberpanel/servers/${serverId}/users?sync=true`);
			refetchUsers();
			toast.success('Users synced from CyberPanel');
		} catch (error) {
			toast.error('Failed to sync users');
		}
	};

	// Delete user mutation
	const deleteUser = async (username: string) => {
		if (
			!confirm(
				`Are you sure you want to delete user "${username}"? This action cannot be undone.`,
			)
		) {
			return;
		}

		try {
			await api.delete(`/cyberpanel/servers/${serverId}/users/${username}`);
			refetchUsers();
			toast.success(`User ${username} deleted`);
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Failed to delete user');
		}
	};

	// Reveal password
	const revealPassword = async (username: string) => {
		if (revealedPasswords[username]) {
			// Toggle off
			const newRevealed = { ...revealedPasswords };
			delete newRevealed[username];
			setRevealedPasswords(newRevealed);
			return;
		}

		if (
			!confirm(
				'Are you sure you want to reveal this password? Make sure no one is looking at your screen.',
			)
		) {
			return;
		}

		setRevealingPassword(username);
		try {
			const response = await api.post(
				`/cyberpanel/servers/${serverId}/users/${username}/reveal-password`,
			);
			setRevealedPasswords({
				...revealedPasswords,
				[username]: response.data.password,
			});
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Failed to reveal password');
		} finally {
			setRevealingPassword(null);
		}
	};

	// Change password
	const changePassword = async (username: string) => {
		if (!confirm(`Generate a new password for "${username}"?`)) {
			return;
		}

		try {
			const response = await api.post(
				`/cyberpanel/servers/${serverId}/users/${username}/password`,
				{},
			);
			setNewUserPassword({ username, password: response.data.password });
			// Clear revealed password if it was showing
			const newRevealed = { ...revealedPasswords };
			delete newRevealed[username];
			setRevealedPasswords(newRevealed);
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Failed to change password');
		}
	};

	// Suspend/unsuspend user
	const toggleSuspend = async (username: string, currentStatus: string) => {
		const action = currentStatus === 'suspended' ? 'unsuspend' : 'suspend';

		try {
			await api.post(
				`/cyberpanel/servers/${serverId}/users/${username}/${action}`,
			);
			refetchUsers();
			toast.success(`User ${username} ${action}ed`);
		} catch (error: any) {
			toast.error(error.response?.data?.detail || `Failed to ${action} user`);
		}
	};

	// Open Panel Login
	const openPanelLogin = async () => {
		setLoadingPanelLogin(true);
		try {
			let response;
			try {
				response = await dashboardApi.getServerPanelSession(Number(serverId));
			} catch (sessionError: any) {
				response = await dashboardApi.getServerPanelLogin(Number(serverId));
			}
			setPanelLoginData(response.data);
			setShowPanelLoginModal(true);
		} catch (error: any) {
			toast.error(
				error.response?.data?.detail || 'Failed to get panel credentials',
			);
		} finally {
			setLoadingPanelLogin(false);
		}
	};

	// Import Site Handler
	const handleImport = (site: any) => {
		navigate('/projects/new', {
			state: {
				importFrom: 'cyberpanel',
				server: server,
				siteData: site,
			},
		});
	};

	// User creation success handler
	const handleUserCreated = (user: any, password: string) => {
		setShowCreateUserModal(false);
		setNewUserPassword({ username: user.username, password });
		refetchUsers();
	};

	// Delete database handler
	const deleteDatabase = async (dbName: string) => {
		if (
			!confirm(
				`Are you sure you want to delete database "${dbName}"? This action cannot be undone.`,
			)
		) {
			return;
		}

		try {
			await dashboardApi.deleteCyberPanelDatabase(Number(serverId), dbName);
			refetchDatabases();
			toast.success(`Database ${dbName} deleted`);
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Failed to delete database');
		}
	};

	// Database creation success handler
	const handleDatabaseCreated = () => {
		setShowCreateDatabaseModal(false);
		refetchDatabases();
		toast.success('Database created successfully');
	};

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
			</div>
		);
	}

	if (!server) {
		return <div>Server not found</div>;
	}

	const isCyberPanel = server.panel_type === 'cyberpanel';

	const websiteColumns: ColumnDef<WebsiteItem>[] = [
		{
			accessorKey: 'domain',
			header: 'Domain',
			cell: ({ row }) => (
				<div className='flex items-center'>
					<Globe className='w-4 h-4 text-gray-400 mr-2' />
					<span className='text-sm font-medium text-gray-900'>
						{row.original.domain}
					</span>
				</div>
			),
		},
		{
			accessorKey: 'adminEmail',
			header: 'User',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500'>
					{row.original.adminEmail || '-'}
				</span>
			),
		},
		{
			accessorKey: 'phpSelection',
			header: 'PHP',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500'>
					{row.original.phpSelection || '-'}
				</span>
			),
		},
		{
			accessorKey: 'state',
			header: 'Status',
			cell: ({ row }) => (
				<Badge
					variant={row.original.state === 'Active' ? 'success' : 'warning'}
				>
					{row.original.state || 'Unknown'}
				</Badge>
			),
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => (
				<div className='flex justify-end'>
					<Button
						size='sm'
						variant='secondary'
						onClick={() => handleImport(row.original)}
					>
						<Download className='w-4 h-4 mr-1' />
						Import
					</Button>
				</div>
			),
		},
	];

	const databaseColumns: ColumnDef<DatabaseItem>[] = [
		{
			accessorKey: 'dbName',
			header: 'Database Name',
			cell: ({ row }) => (
				<div className='flex items-center'>
					<Database className='w-4 h-4 text-purple-500 mr-2' />
					<span className='text-sm font-medium text-gray-900 font-mono'>
						{row.original.dbName}
					</span>
				</div>
			),
		},
		{
			accessorKey: 'dbUser',
			header: 'User',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500 font-mono'>
					{row.original.dbUser || '-'}
				</span>
			),
		},
		{
			accessorKey: 'website',
			header: 'Website',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500'>
					{row.original.website || '-'}
				</span>
			),
		},
		{
			accessorKey: 'size_bytes',
			header: 'Size',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500'>
					{row.original.size_bytes
						? `${(row.original.size_bytes / 1024 / 1024).toFixed(2)} MB`
						: '-'}
				</span>
			),
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => (
				<div className='flex justify-end'>
					<button
						onClick={() => deleteDatabase(row.original.dbName)}
						className='p-1 hover:bg-gray-100 rounded text-red-600'
						title='Delete database'
					>
						<Trash2 className='w-4 h-4' />
					</button>
				</div>
			),
		},
	];

	const userColumns: ColumnDef<CyberPanelUser>[] = [
		{
			accessorKey: 'username',
			header: 'User',
			cell: ({ row }) => (
				<div className='flex items-center'>
					<div className='w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3'>
						<span className='text-sm font-medium text-gray-600'>
							{row.original.username.charAt(0).toUpperCase()}
						</span>
					</div>
					<div>
						<p className='text-sm font-medium text-gray-900'>
							{row.original.username}
						</p>
						<p className='text-xs text-gray-500'>{row.original.email}</p>
					</div>
				</div>
			),
		},
		{
			accessorKey: 'user_type',
			header: 'Type',
			cell: ({ row }) => (
				<Badge
					variant={
						row.original.user_type === 'admin'
							? 'error'
							: row.original.user_type === 'reseller'
								? 'warning'
								: 'default'
					}
				>
					{row.original.user_type}
				</Badge>
			),
		},
		{
			id: 'websites',
			header: 'Websites',
			cell: ({ row }) => (
				<span className='text-sm text-gray-500'>
					{row.original.limits.websites.used} /{' '}
					{row.original.limits.websites.limit || '∞'}
				</span>
			),
		},
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }) => (
				<Badge
					variant={
						row.original.status === 'active'
							? 'success'
							: row.original.status === 'suspended'
								? 'error'
								: 'warning'
					}
				>
					{row.original.status}
				</Badge>
			),
		},
		{
			id: 'password',
			header: 'Password',
			cell: ({ row }) => (
				<>
					{row.original.has_password ? (
						<div className='flex items-center space-x-2'>
							{revealedPasswords[row.original.username] ? (
								<code className='text-xs bg-gray-100 px-2 py-1 rounded'>
									{revealedPasswords[row.original.username]}
								</code>
							) : (
								<span className='text-xs text-gray-400'>••••••••</span>
							)}
							<button
								onClick={() => revealPassword(row.original.username)}
								disabled={revealingPassword === row.original.username}
								className='p-1 hover:bg-gray-100 rounded'
								title={
									revealedPasswords[row.original.username]
										? 'Hide password'
										: 'Reveal password'
								}
							>
								{revealingPassword === row.original.username ? (
									<RefreshCw className='w-4 h-4 animate-spin' />
								) : revealedPasswords[row.original.username] ? (
									<EyeOff className='w-4 h-4 text-gray-400' />
								) : (
									<Eye className='w-4 h-4 text-gray-400' />
								)}
							</button>
						</div>
					) : (
						<span className='text-xs text-gray-400 italic'>
							{row.original.synced_from_panel ? 'Not stored' : 'N/A'}
						</span>
					)}
				</>
			),
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => (
				<div className='flex items-center justify-end space-x-2'>
					<button
						onClick={() => changePassword(row.original.username)}
						className='p-1 hover:bg-gray-100 rounded text-blue-600'
						title='Change password'
					>
						<Key className='w-4 h-4' />
					</button>
					<button
						onClick={() =>
							toggleSuspend(row.original.username, row.original.status)
						}
						className={`p-1 hover:bg-gray-100 rounded ${
							row.original.status === 'suspended'
								? 'text-green-600'
								: 'text-yellow-600'
						}`}
						title={
							row.original.status === 'suspended' ? 'Unsuspend' : 'Suspend'
						}
					>
						{row.original.status === 'suspended' ? (
							<CheckCircle2 className='w-4 h-4' />
						) : (
							<Ban className='w-4 h-4' />
						)}
					</button>
					{row.original.username !== 'admin' && (
						<button
							onClick={() => deleteUser(row.original.username)}
							className='p-1 hover:bg-gray-100 rounded text-red-600'
							title='Delete user'
						>
							<Trash2 className='w-4 h-4' />
						</button>
					)}
				</div>
			),
		},
	];

	return (
		<div className='space-y-6'>
			{/* Panel Login Modal */}
			{showPanelLoginModal && panelLoginData && (
				<PanelLoginModal
					panelData={panelLoginData}
					onClose={() => {
						setShowPanelLoginModal(false);
						setPanelLoginData(null);
					}}
				/>
			)}

			{/* Header */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center space-x-4'>
					<Button variant='ghost' onClick={() => navigate('/servers')}>
						&larr; Back
					</Button>
					<div>
						<h1 className='text-2xl font-bold text-gray-900 flex items-center'>
							{server.name}
							<Badge
								variant={server.status === 'online' ? 'success' : 'warning'}
								className='ml-3'
							>
								{server.status}
							</Badge>
						</h1>
						<p className='mt-1 text-sm text-gray-500'>
							{server.hostname} • {server.provider}
						</p>
					</div>
				</div>
				{/* Panel Login Button */}
				{isCyberPanel && (
					<Button onClick={openPanelLogin} disabled={loadingPanelLogin}>
						{loadingPanelLogin ? (
							<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
						) : (
							<Settings className='w-4 h-4 mr-2' />
						)}
						Open Panel
					</Button>
				)}
			</div>

			{/* Tabs */}
			{isCyberPanel && (
				<div className='border-b border-gray-200'>
					<nav className='-mb-px flex space-x-8'>
						{[
							{ id: 'overview', label: 'Overview', icon: Activity },
							{ id: 'websites', label: 'Websites', icon: Globe },
							{ id: 'databases', label: 'Databases', icon: Database },
							{ id: 'users', label: 'Users', icon: Users },
						].map(tab => (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id as TabType)}
								className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
									activeTab === tab.id
										? 'border-blue-500 text-blue-600'
										: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
								}`}
							>
								<tab.icon className='w-4 h-4 mr-2' />
								{tab.label}
							</button>
						))}
					</nav>
				</div>
			)}

			{/* Tab Content */}
			{activeTab === 'overview' && (
				<>
					{/* Stats Grid */}
					<div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
						<Card>
							<div className='flex items-center space-x-3'>
								<div className='p-2 bg-blue-100 rounded-lg'>
									<Cpu className='w-6 h-6 text-blue-600' />
								</div>
								<div>
									<p className='text-sm text-gray-500'>CPU Usage</p>
									<h3 className='text-xl font-bold'>--%</h3>
								</div>
							</div>
						</Card>
						<Card>
							<div className='flex items-center space-x-3'>
								<div className='p-2 bg-purple-100 rounded-lg'>
									<Activity className='w-6 h-6 text-purple-600' />
								</div>
								<div>
									<p className='text-sm text-gray-500'>Memory</p>
									<h3 className='text-xl font-bold'>--%</h3>
								</div>
							</div>
						</Card>
						<Card>
							<div className='flex items-center space-x-3'>
								<div className='p-2 bg-green-100 rounded-lg'>
									<HardDrive className='w-6 h-6 text-green-600' />
								</div>
								<div>
									<p className='text-sm text-gray-500'>Disk</p>
									<h3 className='text-xl font-bold'>--%</h3>
								</div>
							</div>
						</Card>
					</div>

					{/* Quick Stats */}
					<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
						<Card className='text-center py-6'>
							<Globe className='w-8 h-8 mx-auto text-blue-500 mb-2' />
							<p className='text-2xl font-bold'>{websites.length}</p>
							<p className='text-sm text-gray-500'>Websites</p>
						</Card>
						<Card className='text-center py-6'>
							<Database className='w-8 h-8 mx-auto text-purple-500 mb-2' />
							<p className='text-2xl font-bold'>--</p>
							<p className='text-sm text-gray-500'>Databases</p>
						</Card>
						<Card className='text-center py-6'>
							<Users className='w-8 h-8 mx-auto text-green-500 mb-2' />
							<p className='text-2xl font-bold'>{users.length}</p>
							<p className='text-sm text-gray-500'>Users</p>
						</Card>
						<Card className='text-center py-6'>
							<Settings className='w-8 h-8 mx-auto text-orange-500 mb-2' />
							<p className='text-2xl font-bold capitalize'>
								{server.panel_type || 'None'}
							</p>
							<p className='text-sm text-gray-500'>Panel</p>
						</Card>
					</div>
				</>
			)}

			{activeTab === 'websites' && (
				<Card
					title='Websites'
					className='overflow-hidden'
					actions={
						<Button
							variant='outline'
							onClick={() => refetchWebsites()}
							disabled={isFetchingWebsites}
						>
							<RefreshCw
								className={`w-4 h-4 mr-2 ${
									isFetchingWebsites ? 'animate-spin' : ''
								}`}
							/>
							Sync
						</Button>
					}
				>
					{isFetchingWebsites ? (
						<div className='p-8 text-center text-gray-500'>
							<RefreshCw className='w-8 h-8 mx-auto mb-2 animate-spin' />
							Scanning CyberPanel...
						</div>
					) : websites.length === 0 ? (
						<div className='p-8 text-center text-gray-500'>
							<Globe className='w-12 h-12 mx-auto mb-3 text-gray-300' />
							No websites found. Try syncing.
						</div>
					) : (
						<DataTable
							columns={websiteColumns}
							data={websites}
							showFilter={false}
							filterValue=''
							onFilterChange={() => {}}
							emptyMessage='No websites found. Try syncing.'
							initialPageSize={10}
						/>
					)}
				</Card>
			)}

			{activeTab === 'databases' && (
				<Card
					title='Databases'
					className='overflow-hidden'
					actions={
						<div className='flex space-x-2'>
							<Button
								variant='outline'
								onClick={() => refetchDatabases()}
								disabled={isFetchingDatabases}
							>
								<RefreshCw
									className={`w-4 h-4 mr-2 ${
										isFetchingDatabases ? 'animate-spin' : ''
									}`}
								/>
								Refresh
							</Button>
							<Button onClick={() => setShowCreateDatabaseModal(true)}>
								<Plus className='w-4 h-4 mr-2' />
								Create Database
							</Button>
						</div>
					}
				>
					{isFetchingDatabases ? (
						<div className='p-8 text-center text-gray-500'>
							<RefreshCw className='w-8 h-8 mx-auto mb-2 animate-spin' />
							Loading databases...
						</div>
					) : databases.length === 0 ? (
						<div className='p-8 text-center text-gray-500'>
							<Database className='w-12 h-12 mx-auto mb-3 text-gray-300' />
							No databases found. Create one to get started.
						</div>
					) : (
						<DataTable
							columns={databaseColumns}
							data={databases}
							showFilter={false}
							filterValue=''
							onFilterChange={() => {}}
							emptyMessage='No databases found. Create one to get started.'
							initialPageSize={10}
						/>
					)}
				</Card>
			)}

			{activeTab === 'users' && (
				<Card
					title='CyberPanel Users'
					className='overflow-hidden'
					actions={
						<div className='flex space-x-2'>
							<Button
								variant='outline'
								onClick={syncUsers}
								disabled={isFetchingUsers}
							>
								<RefreshCw
									className={`w-4 h-4 mr-2 ${
										isFetchingUsers ? 'animate-spin' : ''
									}`}
								/>
								Sync
							</Button>
							<Button onClick={() => setShowCreateUserModal(true)}>
								<Plus className='w-4 h-4 mr-2' />
								Add User
							</Button>
						</div>
					}
				>
					{isFetchingUsers ? (
						<div className='p-8 text-center text-gray-500'>
							<RefreshCw className='w-8 h-8 mx-auto mb-2 animate-spin' />
							Loading users...
						</div>
					) : users.length === 0 ? (
						<div className='p-8 text-center text-gray-500'>
							<Users className='w-12 h-12 mx-auto mb-3 text-gray-300' />
							No users found. Sync from CyberPanel or create a new user.
						</div>
					) : (
						<DataTable
							columns={userColumns}
							data={users}
							showFilter={false}
							filterValue=''
							onFilterChange={() => {}}
							emptyMessage='No users found. Sync from CyberPanel or create a new user.'
							initialPageSize={10}
						/>
					)}
				</Card>
			)}

			{/* Modals */}
			{showCreateUserModal && (
				<CreateUserModal
					serverId={Number(serverId)}
					onClose={() => setShowCreateUserModal(false)}
					onSuccess={handleUserCreated}
				/>
			)}

			{newUserPassword && (
				<PasswordDisplayModal
					username={newUserPassword.username}
					password={newUserPassword.password}
					onClose={() => setNewUserPassword(null)}
				/>
			)}

			{showCreateDatabaseModal && (
				<CreateDatabaseModal
					serverId={Number(serverId)}
					websites={websites}
					onClose={() => setShowCreateDatabaseModal(false)}
					onSuccess={handleDatabaseCreated}
				/>
			)}
		</div>
	);
}
