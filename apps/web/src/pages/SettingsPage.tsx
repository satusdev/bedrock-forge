import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';

const editSchema = z.object({ value: z.string().min(1) });
type EditForm = z.infer<typeof editSchema>;

export function SettingsPage() {
	const role = useAuthStore(s => s.user?.role);
	const qc = useQueryClient();
	const [editKey, setEditKey] = useState<string | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ['settings'],
		queryFn: () => api.get<Record<string, string>>('/settings'),
	});

	const mutate = useMutation({
		mutationFn: ({ key, value }: { key: string; value: string }) =>
			api.put(`/settings/${key}`, { value }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['settings'] });
			setEditKey(null);
		},
	});

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<EditForm>({ resolver: zodResolver(editSchema) });

	if (role !== 'admin') {
		return (
			<div className='text-muted-foreground'>
				Access restricted to administrators.
			</div>
		);
	}

	const entries = data ? Object.entries(data) : [];

	return (
		<div className='space-y-4 max-w-2xl'>
			<h1 className='text-2xl font-bold'>Settings</h1>
			{isLoading && <p className='text-muted-foreground'>Loading…</p>}
			<div className='divide-y border rounded-lg'>
				{entries.map(([key, value]) => (
					<div
						key={key}
						className='flex items-center justify-between px-4 py-3 gap-4'
					>
						<span className='font-mono text-sm text-muted-foreground min-w-[180px]'>
							{key}
						</span>
						{editKey === key ? (
							<form
								onSubmit={handleSubmit(fd =>
									mutate.mutate({ key, value: fd.value }),
								)}
								className='flex items-center gap-2 flex-1'
								onReset={() => setEditKey(null)}
							>
								<input
									{...register('value')}
									defaultValue={value}
									className='flex-1 border rounded px-2 py-1 text-sm bg-background'
									autoFocus
								/>
								{errors.value && (
									<span className='text-red-500 text-xs'>
										{errors.value.message}
									</span>
								)}
								<button
									type='submit'
									disabled={mutate.isPending}
									className='text-xs bg-primary text-primary-foreground px-3 py-1 rounded disabled:opacity-50'
								>
									Save
								</button>
								<button type='reset' className='text-xs text-muted-foreground'>
									Cancel
								</button>
							</form>
						) : (
							<>
								<span className='text-sm flex-1 truncate'>{value}</span>
								<button
									onClick={() => {
										reset({ value });
										setEditKey(key);
									}}
									className='text-xs text-primary underline'
								>
									Edit
								</button>
							</>
						)}
					</div>
				))}
				{entries.length === 0 && !isLoading && (
					<p className='px-4 py-3 text-sm text-muted-foreground'>
						No settings configured.
					</p>
				)}
			</div>
		</div>
	);
}
