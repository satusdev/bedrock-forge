import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Shield,
	Plus,
	Edit,
	Trash2,
	Users,
	Key,
	CheckSquare,
	Loader2,
	Square,
	CheckCircle2,
	Lock,
	Info,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { dashboardApi } from '@/services/api';
import toast from 'react-hot-toast';

interface Permission {
	id: number;
	code: string;
	name: string;
	description: string | null;
	category: string;
}

interface Role {
	id: number;
	name: string;
	display_name: string;
	description: string | null;
	color: string;
	is_system: boolean;
	permissions: Permission[];
	user_count?: number;
}

const Roles: React.FC = () => {
	const queryClient = useQueryClient();
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [editingRole, setEditingRole] = useState<Role | null>(null);
	const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
		new Set()
	);
	const [formData, setFormData] = useState({
		name: '',
		display_name: '',
		description: '',
		color: '#6366f1',
		permission_ids: [] as number[],
	});

	// Fetch roles
	const { data: rolesData, isLoading: rolesLoading } = useQuery({
		queryKey: ['roles'],
		queryFn: () => dashboardApi.getRoles(),
	});

	// Fetch permissions
	const { data: permissionsData } = useQuery({
		queryKey: ['permissions'],
		queryFn: () => dashboardApi.getPermissions(),
	});

	// Fetch users to count per role
	const { data: usersData } = useQuery({
		queryKey: ['users'],
		queryFn: () => dashboardApi.getUsers(),
	});

	const roles = rolesData?.data || [];
	const permissions = permissionsData?.data || [];
	const users = usersData?.data || [];

	// Calculate user count per role
	const getUserCountForRole = (roleName: string) => {
		return users.filter((user: any) =>
			user.roles?.some((r: any) => r.name === roleName)
		).length;
	};

	// Group permissions by category
	const permissionsByCategory = permissions.reduce(
		(acc: Record<string, Permission[]>, perm: Permission) => {
			if (!acc[perm.category]) acc[perm.category] = [];
			acc[perm.category].push(perm);
			return acc;
		},
		{}
	);

	const createRoleMutation = useMutation({
		mutationFn: (data: any) => dashboardApi.createRole(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['roles'] });
			toast.success('Role created');
			setShowCreateModal(false);
			resetForm();
		},
		onError: () => toast.error('Failed to create role'),
	});

	const updateRoleMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: any }) =>
			dashboardApi.updateRole(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['roles'] });
			toast.success('Role updated');
			setEditingRole(null);
			resetForm();
		},
		onError: () => toast.error('Failed to update role'),
	});

	const deleteRoleMutation = useMutation({
		mutationFn: (id: number) => dashboardApi.deleteRole(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['roles'] });
			toast.success('Role deleted');
		},
		onError: () => toast.error('Cannot delete system roles'),
	});

	const seedMutation = useMutation({
		mutationFn: async () => {
			await dashboardApi.seedPermissions();
			await dashboardApi.seedRoles();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['roles'] });
			queryClient.invalidateQueries({ queryKey: ['permissions'] });
			toast.success('Default roles and permissions created');
		},
	});

	const resetForm = () => {
		setFormData({
			name: '',
			display_name: '',
			description: '',
			color: '#6366f1',
			permission_ids: [],
		});
		setExpandedCategories(new Set());
	};

	// Toggle all permissions in a category
	const toggleCategory = (category: string, perms: Permission[]) => {
		const permIds = perms.map(p => p.id);
		const allSelected = permIds.every(id =>
			formData.permission_ids.includes(id)
		);
		if (allSelected) {
			setFormData({
				...formData,
				permission_ids: formData.permission_ids.filter(
					id => !permIds.includes(id)
				),
			});
		} else {
			setFormData({
				...formData,
				permission_ids: [...new Set([...formData.permission_ids, ...permIds])],
			});
		}
	};

	// Select all permissions
	const selectAllPermissions = () => {
		setFormData({
			...formData,
			permission_ids: permissions.map((p: Permission) => p.id),
		});
	};

	// Deselect all permissions
	const deselectAllPermissions = () => {
		setFormData({ ...formData, permission_ids: [] });
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (editingRole) {
			updateRoleMutation.mutate({ id: editingRole.id, data: formData });
		} else {
			createRoleMutation.mutate(formData);
		}
	};

	if (rolesLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<Loader2 className='w-8 h-8 animate-spin text-primary-600' />
			</div>
		);
	}

	// Category display names and icons
	const categoryMeta: Record<string, { label: string; color: string }> = {
		projects: {
			label: 'Projects',
			color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		},
		servers: {
			label: 'Servers',
			color:
				'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
		},
		clients: {
			label: 'Clients',
			color:
				'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
		},
		deployments: {
			label: 'Deployments',
			color:
				'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
		},
		backups: {
			label: 'Backups',
			color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
		},
		monitoring: {
			label: 'Monitoring',
			color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
		},
		tags: {
			label: 'Tags',
			color:
				'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
		},
		sync: {
			label: 'Sync',
			color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
		},
		reports: {
			label: 'Reports',
			color:
				'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
		},
		audit: {
			label: 'Audit',
			color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
		},
		templates: {
			label: 'Templates',
			color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
		},
		settings: {
			label: 'Settings',
			color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
		},
		users: {
			label: 'Users & Roles',
			color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
		},
	};

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
						Roles & Permissions
					</h1>
					<p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
						Manage user roles and access permissions
					</p>
				</div>
				<div className='flex items-center gap-3'>
					{roles.length === 0 && (
						<Button
							variant='secondary'
							onClick={() => seedMutation.mutate()}
							disabled={seedMutation.isPending}
						>
							{seedMutation.isPending ? (
								<Loader2 className='w-4 h-4 mr-2 animate-spin' />
							) : (
								<Key className='w-4 h-4 mr-2' />
							)}
							Seed Defaults
						</Button>
					)}
					<Button onClick={() => setShowCreateModal(true)}>
						<Plus className='w-4 h-4 mr-2' />
						Add Role
					</Button>
				</div>
			</div>

			{/* Stats */}
			<div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
				<Card className='p-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg'>
							<Shield className='w-5 h-5 text-primary-600 dark:text-primary-400' />
						</div>
						<div>
							<p className='text-2xl font-bold text-gray-900 dark:text-white'>
								{roles.length}
							</p>
							<p className='text-sm text-gray-500 dark:text-gray-400'>
								Total Roles
							</p>
						</div>
					</div>
				</Card>
				<Card className='p-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg'>
							<Key className='w-5 h-5 text-emerald-600 dark:text-emerald-400' />
						</div>
						<div>
							<p className='text-2xl font-bold text-gray-900 dark:text-white'>
								{permissions.length}
							</p>
							<p className='text-sm text-gray-500 dark:text-gray-400'>
								Permissions
							</p>
						</div>
					</div>
				</Card>
				<Card className='p-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg'>
							<Lock className='w-5 h-5 text-amber-600 dark:text-amber-400' />
						</div>
						<div>
							<p className='text-2xl font-bold text-gray-900 dark:text-white'>
								{roles.filter((r: Role) => r.is_system).length}
							</p>
							<p className='text-sm text-gray-500 dark:text-gray-400'>
								System Roles
							</p>
						</div>
					</div>
				</Card>
				<Card className='p-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg'>
							<Users className='w-5 h-5 text-blue-600 dark:text-blue-400' />
						</div>
						<div>
							<p className='text-2xl font-bold text-gray-900 dark:text-white'>
								{Object.keys(permissionsByCategory).length}
							</p>
							<p className='text-sm text-gray-500 dark:text-gray-400'>
								Categories
							</p>
						</div>
					</div>
				</Card>
			</div>

			{/* Roles Grid */}
			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
				{roles.map((role: Role) => {
					const userCount = getUserCountForRole(role.name);
					return (
						<Card key={role.id} className='hover:shadow-md transition-shadow'>
							<div className='flex items-start justify-between'>
								<div className='flex items-center'>
									<div
										className='w-10 h-10 rounded-lg flex items-center justify-center'
										style={{ backgroundColor: `${role.color}20` }}
									>
										<Shield className='w-5 h-5' style={{ color: role.color }} />
									</div>
									<div className='ml-3'>
										<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
											{role.display_name}
										</h3>
										<p className='text-sm text-gray-500 dark:text-gray-400'>
											{role.description || 'No description'}
										</p>
									</div>
								</div>
								<div className='flex items-center gap-1'>
									{role.is_system ? (
										<Badge variant='info' className='flex items-center gap-1'>
											<Lock className='w-3 h-3' />
											System
										</Badge>
									) : (
										<>
											<Button
												variant='ghost'
												size='sm'
												onClick={() => {
													setEditingRole(role);
													setFormData({
														name: role.name,
														display_name: role.display_name,
														description: role.description || '',
														color: role.color,
														permission_ids: role.permissions.map(p => p.id),
													});
												}}
											>
												<Edit className='w-4 h-4' />
											</Button>
											<Button
												variant='ghost'
												size='sm'
												onClick={() => {
													if (confirm('Delete this role?')) {
														deleteRoleMutation.mutate(role.id);
													}
												}}
											>
												<Trash2 className='w-4 h-4 text-red-500' />
											</Button>
										</>
									)}
								</div>
							</div>

							{/* User count */}
							<div className='mt-3 flex items-center gap-2'>
								<Users className='w-4 h-4 text-gray-400' />
								<span className='text-sm text-gray-600 dark:text-gray-400'>
									{userCount} user{userCount !== 1 ? 's' : ''} assigned
								</span>
							</div>

							<div className='mt-4'>
								<div className='flex items-center justify-between mb-2'>
									<span className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase'>
										Permissions
									</span>
									<span className='text-xs text-gray-500 dark:text-gray-400'>
										{role.permissions.length} total
									</span>
								</div>
								<div className='flex flex-wrap gap-1'>
									{role.permissions.slice(0, 5).map(perm => (
										<span
											key={perm.id}
											className='inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
											title={perm.description || perm.name}
										>
											{perm.name}
										</span>
									))}
									{role.permissions.length > 5 && (
										<span className='inline-flex items-center px-2 py-0.5 rounded text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'>
											+{role.permissions.length - 5} more
										</span>
									)}
								</div>
							</div>
						</Card>
					);
				})}
			</div>

			{/* Create/Edit Modal */}
			{(showCreateModal || editingRole) && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
					<div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto mx-4'>
						<h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
							{editingRole ? 'Edit Role' : 'Create Role'}
						</h3>
						<form onSubmit={handleSubmit} className='space-y-4'>
							<div className='grid grid-cols-2 gap-4'>
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
										Name (slug)
									</label>
									<input
										type='text'
										value={formData.name}
										onChange={e =>
											setFormData({ ...formData, name: e.target.value })
										}
										className='mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
										placeholder='developer'
										required
										disabled={editingRole !== null}
									/>
								</div>
								<div>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
										Display Name
									</label>
									<input
										type='text'
										value={formData.display_name}
										onChange={e =>
											setFormData({ ...formData, display_name: e.target.value })
										}
										className='mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
										placeholder='Developer'
										required
									/>
								</div>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
									Description
								</label>
								<textarea
									value={formData.description}
									onChange={e =>
										setFormData({ ...formData, description: e.target.value })
									}
									className='mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
									rows={2}
								/>
							</div>
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
									Color
								</label>
								<div className='flex items-center space-x-3 mt-1'>
									<input
										type='color'
										value={formData.color}
										onChange={e =>
											setFormData({ ...formData, color: e.target.value })
										}
										className='h-10 w-20 border border-gray-300 dark:border-gray-600 rounded cursor-pointer'
									/>
									<input
										type='text'
										value={formData.color}
										onChange={e =>
											setFormData({ ...formData, color: e.target.value })
										}
										className='w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm'
									/>
								</div>
							</div>

							<div>
								<div className='flex items-center justify-between mb-2'>
									<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
										Permissions ({formData.permission_ids.length} selected)
									</label>
									<div className='flex items-center gap-2'>
										<button
											type='button'
											onClick={selectAllPermissions}
											className='text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400'
										>
											Select All
										</button>
										<span className='text-gray-300 dark:text-gray-600'>|</span>
										<button
											type='button'
											onClick={deselectAllPermissions}
											className='text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400'
										>
											Deselect All
										</button>
									</div>
								</div>
								<div className='border border-gray-200 dark:border-gray-600 rounded-lg p-4 max-h-72 overflow-y-auto space-y-4'>
									{Object.entries(permissionsByCategory).map(
										([category, perms]) => {
											const permIds = (perms as Permission[]).map(p => p.id);
											const selectedCount = permIds.filter(id =>
												formData.permission_ids.includes(id)
											).length;
											const allSelected = selectedCount === permIds.length;
											const someSelected =
												selectedCount > 0 && selectedCount < permIds.length;
											const meta = categoryMeta[category] || {
												label: category,
												color:
													'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
											};

											return (
												<div
													key={category}
													className='border-b border-gray-100 dark:border-gray-700 pb-3 last:border-0 last:pb-0'
												>
													<div className='flex items-center justify-between mb-2'>
														<button
															type='button'
															onClick={() =>
																toggleCategory(category, perms as Permission[])
															}
															className='flex items-center gap-2 group'
														>
															{allSelected ? (
																<CheckCircle2 className='w-4 h-4 text-primary-600' />
															) : someSelected ? (
																<CheckSquare className='w-4 h-4 text-primary-400' />
															) : (
																<Square className='w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300' />
															)}
															<span
																className={`text-sm font-medium px-2 py-0.5 rounded ${meta.color}`}
															>
																{meta.label}
															</span>
														</button>
														<span className='text-xs text-gray-500 dark:text-gray-400'>
															{selectedCount}/{permIds.length}
														</span>
													</div>
													<div className='grid grid-cols-2 gap-2 ml-6'>
														{(perms as Permission[]).map(perm => (
															<label
																key={perm.id}
																className='flex items-start gap-2 cursor-pointer group'
															>
																<input
																	type='checkbox'
																	checked={formData.permission_ids.includes(
																		perm.id
																	)}
																	onChange={e => {
																		if (e.target.checked) {
																			setFormData({
																				...formData,
																				permission_ids: [
																					...formData.permission_ids,
																					perm.id,
																				],
																			});
																		} else {
																			setFormData({
																				...formData,
																				permission_ids:
																					formData.permission_ids.filter(
																						id => id !== perm.id
																					),
																			});
																		}
																	}}
																	className='rounded border-gray-300 dark:border-gray-600 text-primary-600 mt-0.5'
																/>
																<div>
																	<span className='text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white'>
																		{perm.name}
																	</span>
																	{perm.description && (
																		<p className='text-xs text-gray-400 dark:text-gray-500'>
																			{perm.description}
																		</p>
																	)}
																</div>
															</label>
														))}
													</div>
												</div>
											);
										}
									)}
								</div>
							</div>

							<div className='flex justify-end space-x-3 pt-4'>
								<Button
									type='button'
									variant='secondary'
									onClick={() => {
										setShowCreateModal(false);
										setEditingRole(null);
										resetForm();
									}}
								>
									Cancel
								</Button>
								<Button
									type='submit'
									disabled={
										createRoleMutation.isPending || updateRoleMutation.isPending
									}
								>
									{(createRoleMutation.isPending ||
										updateRoleMutation.isPending) && (
										<Loader2 className='w-4 h-4 mr-2 animate-spin' />
									)}
									{editingRole ? 'Update' : 'Create'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
};

export default Roles;
