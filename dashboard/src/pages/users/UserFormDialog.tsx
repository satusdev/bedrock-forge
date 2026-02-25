import React from 'react';

import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Input from '@/components/ui/Input';
import type { Role, User, UserFormData } from './types';

interface UserFormDialogProps {
	open: boolean;
	editingUser: User | null;
	formData: UserFormData;
	roles: Role[];
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onFormChange: (formData: UserFormData) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

const UserFormDialog: React.FC<UserFormDialogProps> = ({
	open,
	editingUser,
	formData,
	roles,
	isPending,
	onOpenChange,
	onFormChange,
	onSubmit,
}) => {
	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={editingUser ? 'Edit User' : 'Create User'}
		>
			<form onSubmit={onSubmit} className='space-y-4'>
				<div>
					<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
						Username
					</label>
					<Input
						value={formData.username}
						onChange={event =>
							onFormChange({ ...formData, username: event.target.value })
						}
						className='mt-1'
						required
					/>
				</div>

				<div>
					<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
						Email
					</label>
					<Input
						type='email'
						value={formData.email}
						onChange={event =>
							onFormChange({ ...formData, email: event.target.value })
						}
						className='mt-1'
						required
					/>
				</div>

				<div>
					<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
						Full Name
					</label>
					<Input
						value={formData.full_name}
						onChange={event =>
							onFormChange({ ...formData, full_name: event.target.value })
						}
						className='mt-1'
					/>
				</div>

				{!editingUser && (
					<div>
						<label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
							Password
						</label>
						<Input
							type='password'
							value={formData.password}
							onChange={event =>
								onFormChange({ ...formData, password: event.target.value })
							}
							className='mt-1'
							required
						/>
					</div>
				)}

				<div>
					<label className='block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300'>
						Roles
					</label>
					<div className='space-y-2 max-h-40 overflow-y-auto rounded-md border border-gray-200 p-3 dark:border-gray-700'>
						{roles.map(role => (
							<label key={role.id} className='flex items-center'>
								<input
									type='checkbox'
									checked={formData.role_ids.includes(role.id)}
									onChange={event => {
										if (event.target.checked) {
											onFormChange({
												...formData,
												role_ids: [...formData.role_ids, role.id],
											});
											return;
										}

										onFormChange({
											...formData,
											role_ids: formData.role_ids.filter(id => id !== role.id),
										});
									}}
									className='rounded border-gray-300 text-primary-600'
								/>
								<span
									className='ml-2 text-sm px-2 py-0.5 rounded'
									style={{
										backgroundColor: `${role.color}20`,
										color: role.color,
									}}
								>
									{role.display_name}
								</span>
							</label>
						))}
					</div>
				</div>

				<div className='flex justify-end gap-3 pt-2'>
					<Button
						type='button'
						variant='secondary'
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button type='submit' disabled={isPending} loading={isPending}>
						{editingUser ? 'Update' : 'Create'}
					</Button>
				</div>
			</form>
		</Dialog>
	);
};

export default UserFormDialog;
