import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Trash2, MoreHorizontal, Shield } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
	PageHeader,
	SearchBar,
	DataTable,
	type Column,
	Pagination,
} from '@/components/crud';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Role {
	id: number;
	name: string;
}

interface User {
	id: number;
	name: string;
	email: string;
	created_at: string;
	roles: string[];
}

interface PaginatedUsers {
	data: User[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
}

const ROLE_COLORS: Record<string, string> = {
	admin: 'destructive',
	manager: 'default',
	client: 'secondary',
};

const userSchema = z.object({
	name: z.string().min(2, 'At least 2 chars').max(100),
	email: z.string().email('Invalid email'),
	password: z
		.string()
		.min(8, 'Min 8 chars')
		.max(128)
		.optional()
		.or(z.literal('')),
	roles: z.array(z.string()).min(1, 'Pick at least one role'),
});

type UserForm = z.infer<typeof userSchema>;

function UserFormDialog({
	open,
	onOpenChange,
	initial,
	allRoles,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial?: User;
	allRoles: Role[];
	onSuccess: () => void;
}) {
	const {
		register,
		handleSubmit,
		setValue,
		watch,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<UserForm>({
		resolver: zodResolver(userSchema),
		defaultValues: {
			name: initial?.name ?? '',
			email: initial?.email ?? '',
			password: '',
			roles: initial?.roles ?? [],
		},
	});

	const selectedRoles = watch('roles');

	function toggleRole(name: string) {
		const current = selectedRoles ?? [];
		setValue(
			'roles',
			current.includes(name)
				? current.filter(r => r !== name)
				: [...current, name],
			{ shouldValidate: true },
		);
	}

	async function onSubmit(data: UserForm) {
		try {
			const payload: Record<string, unknown> = {
				name: data.name,
				email: data.email,
				roles: data.roles,
			};
			if (data.password) payload['password'] = data.password;

			if (initial) {
				await api.put(`/users/${initial.id}`, payload);
				toast({ title: 'User updated' });
			} else {
				if (!data.password) {
					toast({ title: 'Password is required', variant: 'destructive' });
					return;
				}
				await api.post('/users', payload);
				toast({ title: 'User created' });
			}
			reset();
			onSuccess();
			onOpenChange(false);
		} catch {
			toast({ title: 'Save failed', variant: 'destructive' });
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>{initial ? 'Edit User' : 'New User'}</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label htmlFor='u-name'>Name *</Label>
						<Input id='u-name' {...register('name')} placeholder='Jane Smith' />
						{errors.name && (
							<p className='text-xs text-destructive'>{errors.name.message}</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='u-email'>Email *</Label>
						<Input
							id='u-email'
							type='email'
							{...register('email')}
							placeholder='jane@example.com'
						/>
						{errors.email && (
							<p className='text-xs text-destructive'>{errors.email.message}</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='u-password'>
							{initial ? 'New Password (leave blank to keep)' : 'Password *'}
						</Label>
						<Input
							id='u-password'
							type='password'
							{...register('password')}
							placeholder='••••••••'
						/>
						{errors.password && (
							<p className='text-xs text-destructive'>
								{errors.password.message}
							</p>
						)}
					</div>

					<div className='space-y-2'>
						<Label>Roles *</Label>
						<div className='flex flex-wrap gap-3'>
							{allRoles.map(role => (
								<label
									key={role.id}
									className='flex items-center gap-2 text-sm cursor-pointer'
								>
									<input
										type='checkbox'
										className='h-4 w-4 rounded accent-primary cursor-pointer'
										checked={selectedRoles?.includes(role.name) ?? false}
										onChange={() => toggleRole(role.name)}
									/>
									<span className='capitalize'>{role.name}</span>
								</label>
							))}
						</div>
						{errors.roles && (
							<p className='text-xs text-destructive'>{errors.roles.message}</p>
						)}
					</div>

					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isSubmitting ? 'Saving…' : initial ? 'Update' : 'Create'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function UsersPage() {
	const qc = useQueryClient();
	const currentUser = useAuthStore(s => s.user);
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState('');
	const [searchInput, setSearchInput] = useState('');
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<User | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ['users', page, search],
		queryFn: () =>
			api.get<PaginatedUsers>(
				`/users?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
			),
	});

	const { data: allRoles = [] } = useQuery({
		queryKey: ['roles'],
		queryFn: () => api.get<Role[]>('/users/roles'),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/users/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['users'] });
			setDeleteTarget(null);
			toast({ title: 'User deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const totalPages = data?.totalPages ?? 1;

	function invalidate() {
		qc.invalidateQueries({ queryKey: ['users'] });
	}

	const columns: Column<User>[] = [
		{
			header: 'Name',
			render: u => (
				<div className='flex items-center gap-2'>
					<div className='w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0'>
						{u.name
							.split(' ')
							.map(n => n[0])
							.join('')
							.toUpperCase()
							.slice(0, 2)}
					</div>
					<span className='font-medium'>{u.name}</span>
				</div>
			),
		},
		{
			header: 'Email',
			render: u => <span className='text-muted-foreground'>{u.email}</span>,
		},
		{
			header: 'Roles',
			render: u => (
				<div className='flex flex-wrap gap-1'>
					{u.roles.map(role => (
						<Badge
							key={role}
							variant={
								(ROLE_COLORS[role] ?? 'outline') as
									| 'destructive'
									| 'default'
									| 'secondary'
									| 'outline'
							}
							className='capitalize text-xs'
						>
							<Shield className='h-2.5 w-2.5 mr-1' />
							{role}
						</Badge>
					))}
				</div>
			),
		},
		{
			header: 'Joined',
			render: u => (
				<span className='text-muted-foreground text-sm'>
					{new Date(u.created_at).toLocaleDateString()}
				</span>
			),
		},
	];

	return (
		<div className='space-y-4'>
			<PageHeader
				title='Users & Roles'
				onCreate={() => setCreateOpen(true)}
				createLabel='New User'
			/>

			<SearchBar
				value={searchInput}
				onChange={setSearchInput}
				onSearch={() => {
					setSearch(searchInput);
					setPage(1);
				}}
				onClear={() => {
					setSearch('');
					setSearchInput('');
					setPage(1);
				}}
				placeholder='Search users…'
				totalCount={data?.total ?? 0}
				totalLabel='total users'
			/>

			<DataTable
				columns={columns}
				data={data?.data ?? []}
				isLoading={isLoading}
				rowKey={u => u.id}
				emptyMessage={search ? 'No results for that search.' : 'No users yet.'}
				renderActions={user => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon' className='h-7 w-7'>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuItem onClick={() => setEditTarget(user)}>
								<Pencil className='h-4 w-4 mr-2' />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								className='text-destructive focus:text-destructive'
								onClick={() => setDeleteTarget(user)}
								disabled={user.id === currentUser?.id}
							>
								<Trash2 className='h-4 w-4 mr-2' />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			<Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

			<UserFormDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				allRoles={allRoles}
				onSuccess={invalidate}
			/>

			{editTarget && (
				<UserFormDialog
					key={editTarget.id}
					open
					onOpenChange={o => !o && setEditTarget(null)}
					initial={editTarget}
					allRoles={allRoles}
					onSuccess={invalidate}
				/>
			)}

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete User'
				description={`"${deleteTarget?.name}" will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
