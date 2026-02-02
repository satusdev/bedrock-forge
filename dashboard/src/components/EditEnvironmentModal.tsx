import React, { useEffect, useMemo, useState } from 'react';
import {
	X,
	Save,
	User as UserIcon,
	ExternalLink,
	Plus,
	Loader2,
	Key,
	HardDrive,
	Database,
	Globe,
	FileText,
	Shield,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../services/api';
import toast from 'react-hot-toast';
import Button from './ui/Button';
import GoogleDriveFolderPicker from './GoogleDriveFolderPicker';

interface EditEnvironmentModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectId: number;
	environment: any;
}

export default function EditEnvironmentModal({
	isOpen,
	onClose,
	projectId,
	environment,
}: EditEnvironmentModalProps) {
	const queryClient = useQueryClient();
	const [showAddUser, setShowAddUser] = useState(false);
	const [showDrivePicker, setShowDrivePicker] = useState(false);
	const [backupFolderName, setBackupFolderName] = useState('');
	const [showDbPassword, setShowDbPassword] = useState(false);

	const [formData, setFormData] = useState({
		environment: '',
		wp_path: '',
		wp_url: '',
		ssh_user: '',
		ssh_key_path: '',
		gdrive_backups_folder_id: '',
		database_name: '',
		database_user: '',
		database_password: '',
		notes: '',
	});

	const [newUser, setNewUser] = useState({
		user_login: '',
		user_email: '',
		role: 'subscriber',
		send_email: false,
	});

	useEffect(() => {
		if (!environment) return;
		setFormData({
			environment: environment.environment || '',
			wp_path: environment.wp_path || '',
			wp_url: environment.wp_url || '',
			ssh_user: environment.ssh_user || '',
			ssh_key_path: environment.ssh_key_path || '',
			gdrive_backups_folder_id: environment.gdrive_backups_folder_id || '',
			database_name: environment.database_name || '',
			database_user: environment.database_user || '',
			database_password: environment.database_password || '',
			notes: environment.notes || '',
		});
	}, [environment]);

	const updateMutation = useMutation({
		mutationFn: (data: any) =>
			dashboardApi.updateEnvironment(projectId, environment.id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['project-environments', projectId],
			});
			toast.success('Environment updated');
			onClose();
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Update failed');
		},
	});

	const {
		data: usersData,
		isLoading: usersLoading,
		refetch: refetchUsers,
	} = useQuery({
		queryKey: ['env-users', environment?.id],
		queryFn: () => dashboardApi.getEnvironmentUsers(projectId, environment.id),
		enabled: isOpen && !!environment,
	});
	const users = (usersData?.data || []) as any[];

	const createUserMutation = useMutation({
		mutationFn: (data: any) =>
			dashboardApi.createEnvironmentUser(projectId, environment.id, data),
		onSuccess: () => {
			toast.success('User created successfully');
			setShowAddUser(false);
			setNewUser({
				user_login: '',
				user_email: '',
				role: 'subscriber',
				send_email: false,
			});
			refetchUsers();
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to create user');
		},
	});

	const magicLoginMutation = useMutation({
		mutationFn: (userId: string) =>
			dashboardApi.magicLogin(projectId, environment.id, userId),
		onSuccess: response => {
			const url = response.data.url;
			window.open(url, '_blank');
			toast.success('Magic login link opened!');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Magic login failed');
		},
	});

	const handleDriveFolderSelect = (
		folderId: string,
		folderName: string,
		path: string
	) => {
		setFormData(prev => ({
			...prev,
			gdrive_backups_folder_id: folderId,
		}));
		setBackupFolderName(folderName);
		setShowDrivePicker(false);
		toast.success(`Selected folder: ${folderName}`);
	};

	const handleSaveSettings = (e: React.FormEvent) => {
		e.preventDefault();
		updateMutation.mutate(formData);
	};

	const handleCreateUser = (e: React.FormEvent) => {
		e.preventDefault();
		createUserMutation.mutate(newUser);
	};

	const headerLabel = useMemo(() => {
		if (!environment) return 'Edit Environment';
		return `${
			environment.environment?.toUpperCase?.() || environment.environment
		} • ${environment.server_name || 'Server'}`;
	}, [environment]);

	if (!isOpen || !environment) return null;

	return (
		<div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
			<div className='bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden'>
				<div className='px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between'>
					<div className='flex items-center gap-3'>
						<div className='w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center'>
							<Shield className='w-5 h-5' />
						</div>
						<div>
							<h2 className='text-lg font-semibold text-gray-900'>
								Edit Environment
							</h2>
							<p className='text-sm text-gray-500'>{headerLabel}</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className='text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg'
					>
						<X className='w-5 h-5' />
					</button>
				</div>

				<form onSubmit={handleSaveSettings} className='flex-1 overflow-y-auto'>
					<div className='p-6 space-y-6'>
						<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
							<div className='space-y-4 rounded-xl border border-gray-200 p-4'>
								<h3 className='text-sm font-semibold text-gray-900 flex items-center gap-2'>
									<Globe className='w-4 h-4 text-blue-500' />
									WordPress
								</h3>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Environment Type
									</label>
									<select
										value={formData.environment}
										onChange={e =>
											setFormData({ ...formData, environment: e.target.value })
										}
										className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
									>
										<option value='staging'>Staging</option>
										<option value='production'>Production</option>
										<option value='development'>Development</option>
									</select>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Site URL
									</label>
									<input
										type='text'
										value={formData.wp_url}
										onChange={e =>
											setFormData({ ...formData, wp_url: e.target.value })
										}
										placeholder='https://site.example.com'
										className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
									/>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										WP Path
									</label>
									<input
										type='text'
										value={formData.wp_path}
										onChange={e =>
											setFormData({ ...formData, wp_path: e.target.value })
										}
										placeholder='/home/domain.com/public_html'
										className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
									/>
									<p className='text-[11px] text-gray-500 mt-1'>
										CyberPanel default: /home/domain.com/public_html
									</p>
								</div>
							</div>

							<div className='space-y-4 rounded-xl border border-gray-200 p-4'>
								<h3 className='text-sm font-semibold text-gray-900 flex items-center gap-2'>
									<Key className='w-4 h-4 text-emerald-500' />
									SSH Access
								</h3>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										SSH User
									</label>
									<input
										type='text'
										value={formData.ssh_user}
										onChange={e =>
											setFormData({ ...formData, ssh_user: e.target.value })
										}
										placeholder='root'
										className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
									/>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										SSH Key Path
									</label>
									<input
										type='text'
										value={formData.ssh_key_path}
										onChange={e =>
											setFormData({ ...formData, ssh_key_path: e.target.value })
										}
										placeholder='/home/user/.ssh/id_rsa'
										className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
									/>
									<p className='text-[11px] text-gray-500 mt-1'>
										Leave blank to use server defaults.
									</p>
								</div>
							</div>
						</div>

						<div className='rounded-xl border border-gray-200 p-4 space-y-4'>
							<h3 className='text-sm font-semibold text-gray-900 flex items-center gap-2'>
								<Database className='w-4 h-4 text-purple-500' />
								Database Credentials
							</h3>
							<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Database Name
									</label>
									<input
										type='text'
										value={formData.database_name}
										onChange={e =>
											setFormData({
												...formData,
												database_name: e.target.value,
											})
										}
										placeholder='wp_database'
										className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
									/>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Database User
									</label>
									<input
										type='text'
										value={formData.database_user}
										onChange={e =>
											setFormData({
												...formData,
												database_user: e.target.value,
											})
										}
										placeholder='wp_user'
										className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
									/>
								</div>
								<div>
									<label className='block text-xs font-medium text-gray-600 mb-1'>
										Database Password
									</label>
									<div className='relative'>
										<input
											type={showDbPassword ? 'text' : 'password'}
											value={formData.database_password}
											onChange={e =>
												setFormData({
													...formData,
													database_password: e.target.value,
												})
											}
											placeholder='••••••••'
											className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500 pr-10'
										/>
										<button
											type='button'
											onClick={() => setShowDbPassword(!showDbPassword)}
											className='absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600'
										>
											<Key className='w-4 h-4' />
										</button>
									</div>
								</div>
							</div>
							<p className='text-[11px] text-gray-500'>
								Passwords are encrypted at rest.
							</p>
						</div>

						<div className='rounded-xl border border-gray-200 p-4 space-y-4'>
							<h3 className='text-sm font-semibold text-gray-900 flex items-center gap-2'>
								<HardDrive className='w-4 h-4 text-orange-500' />
								Backups & Notes
							</h3>
							<div>
								<label className='block text-xs font-medium text-gray-600 mb-1'>
									Google Drive Folder ID
								</label>
								<div className='flex gap-2'>
									<div className='relative flex-1'>
										<input
											type='text'
											value={formData.gdrive_backups_folder_id}
											onChange={e => {
												setFormData({
													...formData,
													gdrive_backups_folder_id: e.target.value,
												});
												if (backupFolderName) setBackupFolderName('');
											}}
											placeholder='1abc123...'
											className='w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
										/>
										{backupFolderName && (
											<div className='absolute right-3 top-2.5 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded'>
												{backupFolderName}
											</div>
										)}
									</div>
									<button
										type='button'
										onClick={() => setShowDrivePicker(true)}
										className='px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg border border-blue-100'
										title='Browse Google Drive'
									>
										<HardDrive className='w-4 h-4' />
									</button>
									{formData.gdrive_backups_folder_id && (
										<a
											href={`https://drive.google.com/drive/folders/${formData.gdrive_backups_folder_id}`}
											target='_blank'
											rel='noopener noreferrer'
											className='px-3 py-2 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-lg'
											title='Open in Google Drive'
										>
											<ExternalLink className='w-4 h-4' />
										</a>
									)}
								</div>
							</div>
							<div>
								<label className='block text-xs font-medium text-gray-600 mb-1'>
									Notes
								</label>
								<div className='relative'>
									<FileText className='absolute left-3 top-3 h-4 w-4 text-gray-400' />
									<textarea
										rows={3}
										value={formData.notes}
										onChange={e =>
											setFormData({ ...formData, notes: e.target.value })
										}
										className='w-full pl-9 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500'
										placeholder='Internal notes...'
									/>
								</div>
							</div>
						</div>

						<div className='rounded-xl border border-gray-200 p-4 space-y-4'>
							<div className='flex items-center justify-between'>
								<h3 className='text-sm font-semibold text-gray-900 flex items-center gap-2'>
									<UserIcon className='w-4 h-4 text-slate-500' />
									WordPress Users
								</h3>
								<Button size='sm' onClick={() => setShowAddUser(!showAddUser)}>
									<Plus className='w-4 h-4 mr-1' />
									Add User
								</Button>
							</div>

							{showAddUser && (
								<form
									onSubmit={handleCreateUser}
									className='bg-gray-50 p-4 rounded-lg space-y-3 border'
								>
									<div className='grid grid-cols-2 gap-3'>
										<input
											type='text'
											placeholder='Username'
											value={newUser.user_login}
											onChange={e =>
												setNewUser({ ...newUser, user_login: e.target.value })
											}
											className='rounded border-gray-300 text-sm bg-white'
											required
										/>
										<input
											type='email'
											placeholder='Email'
											value={newUser.user_email}
											onChange={e =>
												setNewUser({ ...newUser, user_email: e.target.value })
											}
											className='rounded border-gray-300 text-sm bg-white'
											required
										/>
									</div>
									<div className='flex items-center gap-3'>
										<select
											value={newUser.role}
											onChange={e =>
												setNewUser({ ...newUser, role: e.target.value })
											}
											className='rounded border-gray-300 text-sm bg-white'
										>
											<option value='subscriber'>Subscriber</option>
											<option value='contributor'>Contributor</option>
											<option value='author'>Author</option>
											<option value='editor'>Editor</option>
											<option value='administrator'>Administrator</option>
										</select>
										<label className='flex items-center gap-2 text-sm text-gray-600'>
											<input
												type='checkbox'
												checked={newUser.send_email}
												onChange={e =>
													setNewUser({
														...newUser,
														send_email: e.target.checked,
													})
												}
												className='rounded border-gray-300'
											/>
											Send Email
										</label>
										<div className='flex-1 flex justify-end gap-2'>
											<Button
												size='sm'
												variant='secondary'
												onClick={() => setShowAddUser(false)}
												type='button'
											>
												Cancel
											</Button>
											<Button
												size='sm'
												type='submit'
												disabled={createUserMutation.isPending}
											>
												{createUserMutation.isPending
													? 'Creating...'
													: 'Create'}
											</Button>
										</div>
									</div>
								</form>
							)}

							{usersLoading ? (
								<div className='flex justify-center p-6'>
									<Loader2 className='w-5 h-5 animate-spin text-gray-400' />
								</div>
							) : (
								<div className='border rounded-lg overflow-hidden'>
									<table className='w-full text-sm text-left'>
										<thead className='bg-gray-50 text-gray-500'>
											<tr>
												<th className='px-4 py-2 font-medium'>User</th>
												<th className='px-4 py-2 font-medium'>Role</th>
												<th className='px-4 py-2 font-medium text-right'>
													Actions
												</th>
											</tr>
										</thead>
										<tbody className='divide-y'>
											{users.map((user: any) => (
												<tr key={user.ID}>
													<td className='px-4 py-3'>
														<div className='font-medium text-gray-900'>
															{user.user_login}
														</div>
														<div className='text-xs text-gray-500'>
															{user.user_email}
														</div>
													</td>
													<td className='px-4 py-3 capitalize'>
														{user.roles.join(', ')}
													</td>
													<td className='px-4 py-3 text-right'>
														<Button
															size='sm'
															variant='secondary'
															onClick={() =>
																magicLoginMutation.mutate(String(user.ID))
															}
															disabled={magicLoginMutation.isPending}
														>
															<Key className='w-3 h-3 mr-1' />
															Login
														</Button>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</div>
					<div className='sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end gap-3'>
						<Button type='button' variant='secondary' onClick={onClose}>
							Cancel
						</Button>
						<Button
							type='submit'
							variant='primary'
							disabled={updateMutation.isPending}
						>
							{updateMutation.isPending ? (
								<Loader2 className='w-4 h-4 animate-spin mr-2' />
							) : (
								<Save className='w-4 h-4 mr-2' />
							)}
							Save Changes
						</Button>
					</div>
				</form>

				{showDrivePicker && (
					<div className='fixed inset-0 z-[60] flex items-center justify-center bg-black/50'>
						<GoogleDriveFolderPicker
							onSelect={handleDriveFolderSelect}
							onCancel={() => setShowDrivePicker(false)}
							initialFolderId={formData.gdrive_backups_folder_id || undefined}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
