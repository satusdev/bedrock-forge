import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Zap } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

const schema = z.object({
	email: z.string().email('Enter a valid email'),
	password: z.string().min(6, 'Password must be at least 6 characters'),
});
type FormData = z.infer<typeof schema>;

const DEV_EMAIL = import.meta.env.VITE_DEV_EMAIL as string | undefined;
const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD as string | undefined;
const hasDevCredentials = Boolean(DEV_EMAIL && DEV_PASSWORD);

export function LoginPage() {
	const navigate = useNavigate();
	const { setTokens, setUser } = useAuthStore();
	const [error, setError] = useState('');
	const [showPassword, setShowPassword] = useState(false);

	const {
		register,
		handleSubmit,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<FormData>({ resolver: zodResolver(schema) });

	const fillDevCredentials = () => {
		setValue('email', DEV_EMAIL!);
		setValue('password', DEV_PASSWORD!);
	};

	const onSubmit = async (data: FormData) => {
		setError('');
		try {
			const res = await api.post<{
				accessToken: string;
				refreshToken: string;
				user: { id: number; email: string; name: string; roles: string[] };
			}>('/auth/login', data);
			setTokens(res.accessToken, res.refreshToken);
			setUser(res.user);
			navigate('/dashboard');
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : 'Invalid credentials');
		}
	};

	return (
		<div className='min-h-screen flex items-center justify-center bg-background px-4'>
			<div className='w-full max-w-sm'>
				{/* Logo */}
				<div className='text-center mb-6'>
					<div className='inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground text-2xl font-bold mb-3'>
						B
					</div>
					<h1 className='text-2xl font-bold tracking-tight'>Bedrock Forge</h1>
					<p className='text-muted-foreground text-sm mt-1'>
						WordPress management platform
					</p>
				</div>

				<Card className='shadow-md'>
					<CardHeader className='pb-4'>
						<CardTitle className='text-lg'>Sign in</CardTitle>
						<CardDescription>
							Enter your credentials to access the dashboard
						</CardDescription>
					</CardHeader>

					<CardContent>
						{hasDevCredentials && (
							<button
								type='button'
								onClick={fillDevCredentials}
								className='mb-4 w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors dark:border-amber-500 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50'
							>
								<Zap className='h-3.5 w-3.5' />
								Fill seed credentials
							</button>
						)}
						<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
							<div className='space-y-1.5'>
								<Label htmlFor='email'>Email</Label>
								<Input
									id='email'
									{...register('email')}
									type='email'
									placeholder='admin@example.com'
									autoComplete='email'
									autoFocus
								/>
								{errors.email && (
									<p className='text-destructive text-xs'>
										{errors.email.message}
									</p>
								)}
							</div>

							<div className='space-y-1.5'>
								<Label htmlFor='password'>Password</Label>
								<div className='relative'>
									<Input
										id='password'
										{...register('password')}
										type={showPassword ? 'text' : 'password'}
										placeholder='••••••••'
										autoComplete='current-password'
										className='pr-10'
									/>
									<button
										type='button'
										onClick={() => setShowPassword(v => !v)}
										className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors'
										tabIndex={-1}
									>
										{showPassword ? (
											<EyeOff className='h-4 w-4' />
										) : (
											<Eye className='h-4 w-4' />
										)}
										<span className='sr-only'>
											{showPassword ? 'Hide password' : 'Show password'}
										</span>
									</button>
								</div>
								{errors.password && (
									<p className='text-destructive text-xs'>
										{errors.password.message}
									</p>
								)}
							</div>

							{error && (
								<div className='rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2'>
									<p className='text-destructive text-sm'>{error}</p>
								</div>
							)}

							<Button type='submit' className='w-full' disabled={isSubmitting}>
								{isSubmitting ? (
									<>
										<Loader2 className='mr-2 h-4 w-4 animate-spin' />
										Signing in…
									</>
								) : (
									'Sign in'
								)}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
