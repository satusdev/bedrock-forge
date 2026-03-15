import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { dashboardApi } from '@/services/api';
import { queryKeys } from '@/services/queryKeys';
import toast from 'react-hot-toast';
import { createUserColumns } from '@/pages/users/columns';
import UserFormDialog from '@/pages/users/UserFormDialog';
import type { User, UserFormData } from '@/pages/users/types';

const Users: React.FC = () => {
	const queryClient = useQueryClient();
	const [searchTerm, setSearchTerm] = useState('');
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingUser, setEditingUser] = useState<User | null>(null);
	const [formData, setFormData] = useState<UserFormData>({
		email: '',
		username: '',
		password: '',
		full_name: '',
		role_ids: [] as number[],
	});

	const { data: usersData, isLoading } = useQuery({
		queryKey: queryKeys.users.list(searchTerm),
		queryFn: () => dashboardApi.getUsers(searchTerm),
	});

	const { data: rolesData } = useQuery({
		queryKey: queryKeys.roles.all,
		queryFn: () => dashboardApi.getRoles(),
	});

	const users = usersData?.data || [];
	const roles = rolesData?.data || [];

	const createUserMutation = useMutation({
		mutationFn: (data: any) => dashboardApi.createUser(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
			toast.success('User created');
			setDialogOpen(false);
			resetForm();
		},
		onError: () => toast.error('Failed to create user'),
	});

	const updateUserMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: any }) =>
			dashboardApi.updateUser(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
			toast.success('User updated');
			setEditingUser(null);
			setDialogOpen(false);
			resetForm();
		},
		onError: () => toast.error('Failed to update user'),
	});

	const deleteUserMutation = useMutation({
		mutationFn: (id: number) => dashboardApi.deleteUser(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
			toast.success('User deleted');
		},
		onError: () => toast.error('Failed to delete user'),
	});

	const resetForm = () => {
		setFormData({
			email: '',
			username: '',
			password: '',
			full_name: '',
			role_ids: [],
		});
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (editingUser) {
			updateUserMutation.mutate({ id: editingUser.id, data: formData });
		} else {
			createUserMutation.mutate(formData);
		}
	};

	const columns = useMemo(
		() =>
			createUserColumns({
				onEdit: user => {
					setEditingUser(user);
					setFormData({
						email: user.email,
						username: user.username,
						password: '',
						full_name: user.full_name || '',
						role_ids: user.roles.map(role => role.id),
					});
					setDialogOpen(true);
				},
				onDelete: user => {
					if (window.confirm('Delete this user?')) {
						deleteUserMutation.mutate(user.id);
					}
				},
			}),
		[deleteUserMutation],
	);

	const isSubmitting =
		createUserMutation.isPending || updateUserMutation.isPending;

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600'></div>
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900'>Users</h1>
					<p className='mt-1 text-sm text-gray-500'>
						Manage user accounts and role assignments
					</p>
				</div>
				<Button
					onClick={() => {
						setEditingUser(null);
						resetForm();
						setDialogOpen(true);
					}}
				>
					<UserPlus className='w-4 h-4 mr-2' />
					Add User
				</Button>
			</div>

			{/* Users Table */}
			<Card>
				<DataTable
					columns={columns}
					data={users}
					filterValue={searchTerm}
					onFilterChange={setSearchTerm}
					filterPlaceholder='Search users by name or email...'
					emptyMessage='No users found.'
					initialPageSize={10}
				/>
			</Card>

			<UserFormDialog
				open={dialogOpen}
				editingUser={editingUser}
				formData={formData}
				roles={roles}
				isPending={isSubmitting}
				onOpenChange={open => {
					setDialogOpen(open);

					if (!open) {
						setEditingUser(null);
						resetForm();
					}
				}}
				onFormChange={setFormData}
				onSubmit={handleSubmit}
			/>
		</div>
	);
};

export default Users;
