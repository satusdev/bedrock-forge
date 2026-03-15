import { type ColumnDef } from '@tanstack/react-table';
import { CheckCircle, Edit, Trash2, XCircle } from 'lucide-react';

import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import type { User } from './types';

interface UserColumnsProps {
	onEdit: (user: User) => void;
	onDelete: (user: User) => void;
}

export function createUserColumns({
	onEdit,
	onDelete,
}: UserColumnsProps): ColumnDef<User>[] {
	return [
		{
			accessorKey: 'full_name',
			header: 'User',
			cell: ({ row }) => {
				const user = row.original;

				return (
					<div className='flex items-center'>
						<div className='flex-shrink-0 h-10 w-10'>
							{user.avatar_url ? (
								<img
									className='h-10 w-10 rounded-full'
									src={user.avatar_url}
									alt={user.username}
								/>
							) : (
								<div className='h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center'>
									<span className='text-primary-600 font-medium'>
										{user.username.charAt(0).toUpperCase()}
									</span>
								</div>
							)}
						</div>
						<div className='ml-4'>
							<div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
								{user.full_name || user.username}
							</div>
							<div className='text-sm text-gray-500 dark:text-gray-400'>
								@{user.username}
							</div>
						</div>
					</div>
				);
			},
		},
		{
			accessorKey: 'email',
			header: 'Email',
			cell: ({ row }) => (
				<div className='text-sm text-gray-900 dark:text-gray-100'>
					{row.original.email}
				</div>
			),
		},
		{
			accessorKey: 'roles',
			header: 'Roles',
			cell: ({ row }) => {
				const user = row.original;

				return (
					<div className='flex flex-wrap gap-1'>
						{user.is_superuser && <Badge variant='danger'>Admin</Badge>}
						{user.roles.map(role => (
							<span
								key={role.id}
								className='inline-flex items-center px-2 py-0.5 rounded text-xs font-medium'
								style={{
									backgroundColor: `${role.color}20`,
									color: role.color,
								}}
							>
								{role.display_name}
							</span>
						))}
					</div>
				);
			},
		},
		{
			accessorKey: 'is_active',
			header: 'Status',
			cell: ({ row }) => {
				const isActive = row.original.is_active;

				return isActive ? (
					<Badge variant='success'>
						<CheckCircle className='w-3 h-3 mr-1' /> Active
					</Badge>
				) : (
					<Badge variant='warning'>
						<XCircle className='w-3 h-3 mr-1' /> Inactive
					</Badge>
				);
			},
		},
		{
			id: 'actions',
			header: () => <div className='text-right'>Actions</div>,
			cell: ({ row }) => {
				const user = row.original;

				return (
					<div className='flex justify-end gap-2'>
						<Button variant='ghost' size='sm' onClick={() => onEdit(user)}>
							<Edit className='w-4 h-4' />
						</Button>
						<Button variant='ghost' size='sm' onClick={() => onDelete(user)}>
							<Trash2 className='w-4 h-4 text-red-500' />
						</Button>
					</div>
				);
			},
		},
	];
}
