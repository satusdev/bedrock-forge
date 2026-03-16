import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';

const schema = z.object({
	email: z.string().email(),
	password: z.string().min(6),
});
type FormData = z.infer<typeof schema>;

export function LoginPage() {
	const navigate = useNavigate();
	const { setTokens, setUser } = useAuthStore();
	const [error, setError] = useState('');
	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting },
	} = useForm<FormData>({ resolver: zodResolver(schema) });

	const onSubmit = async (data: FormData) => {
		setError('');
		try {
			const res = await api.post<{
				access_token: string;
				refresh_token: string;
				user: { id: number; email: string; name: string; roles: string[] };
			}>('/auth/login', data);
			setTokens(res.access_token, res.refresh_token);
			setUser(res.user);
			navigate('/dashboard');
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Login failed');
		}
	};

	return (
		<div className='min-h-screen flex items-center justify-center bg-background'>
			<div className='w-full max-w-sm space-y-6 p-8 bg-card rounded-lg border shadow-sm'>
				<div className='text-center'>
					<h1 className='text-2xl font-bold'>⚒ Bedrock Forge</h1>
					<p className='text-muted-foreground text-sm mt-1'>
						Sign in to your account
					</p>
				</div>

				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div>
						<label className='block text-sm font-medium mb-1'>Email</label>
						<input
							{...register('email')}
							type='email'
							className='w-full border rounded-md px-3 py-2 text-sm bg-input'
							placeholder='admin@example.com'
						/>
						{errors.email && (
							<p className='text-destructive text-xs mt-1'>
								{errors.email.message}
							</p>
						)}
					</div>

					<div>
						<label className='block text-sm font-medium mb-1'>Password</label>
						<input
							{...register('password')}
							type='password'
							className='w-full border rounded-md px-3 py-2 text-sm bg-input'
							placeholder='••••••••'
						/>
						{errors.password && (
							<p className='text-destructive text-xs mt-1'>
								{errors.password.message}
							</p>
						)}
					</div>

					{error && <p className='text-destructive text-sm'>{error}</p>}

					<button
						type='submit'
						disabled={isSubmitting}
						className='w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium disabled:opacity-50'
					>
						{isSubmitting ? 'Signing in…' : 'Sign in'}
					</button>
				</form>
			</div>
		</div>
	);
}
