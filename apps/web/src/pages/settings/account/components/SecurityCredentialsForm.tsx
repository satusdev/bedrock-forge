import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useChangePasswordMutation } from '../hooks';

const changePasswordSchema = z
	.object({
		current_password: z.string().min(1, 'Current password is required'),
		new_password: z.string().min(8, 'At least 8 characters'),
		confirm_password: z.string(),
	})
	.refine(d => d.new_password === d.confirm_password, {
		message: 'Passwords do not match',
		path: ['confirm_password'],
	});

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export function SecurityCredentialsForm() {
	const {
		register: regPwd,
		handleSubmit: handlePwd,
		reset: resetPwd,
		formState: { errors: pwdErrors },
	} = useForm<ChangePasswordForm>({
		resolver: zodResolver(changePasswordSchema),
	});

	const changePasswordMutation = useChangePasswordMutation(() => {
		resetPwd();
	});

	function onChangePassword(data: ChangePasswordForm) {
		changePasswordMutation.mutate({
			current_password: data.current_password,
			new_password: data.new_password,
		});
	}

	return (
		<Card className='overflow-hidden'>
			<CardHeader className='bg-muted/40 pb-4'>
				<div className='flex items-center gap-3'>
					<div className='p-2 bg-primary/10 rounded-lg'>
						<Lock className='h-5 w-5 text-primary' />
					</div>
					<div>
						<CardTitle className='text-lg'>Security Credentials</CardTitle>
						<CardDescription>Update your password to keep your account secure.</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className='pt-6'>
				<form onSubmit={handlePwd(onChangePassword)} className='space-y-4 max-w-md'>
					<div className='space-y-1.5'>
						<Label htmlFor='cp-current'>Current Password</Label>
						<Input
							id='cp-current'
							type='password'
							{...regPwd('current_password')}
							autoComplete='current-password'
							className='bg-muted/20'
						/>
						{pwdErrors.current_password && (
							<p className='text-[10px] font-bold text-destructive uppercase tracking-wider'>
								{pwdErrors.current_password.message}
							</p>
						)}
					</div>
					<div className='grid grid-cols-2 gap-4'>
						<div className='space-y-1.5'>
							<Label htmlFor='cp-new'>New Password</Label>
							<Input
								id='cp-new'
								type='password'
								{...regPwd('new_password')}
								autoComplete='new-password'
								className='bg-muted/20'
							/>
							{pwdErrors.new_password && (
								<p className='text-[10px] font-bold text-destructive uppercase tracking-wider'>
									{pwdErrors.new_password.message}
								</p>
							)}
						</div>
						<div className='space-y-1.5'>
							<Label htmlFor='cp-confirm'>Confirm Password</Label>
							<Input
								id='cp-confirm'
								type='password'
								{...regPwd('confirm_password')}
								autoComplete='new-password'
								className='bg-muted/20'
							/>
							{pwdErrors.confirm_password && (
								<p className='text-[10px] font-bold text-destructive uppercase tracking-wider'>
									{pwdErrors.confirm_password.message}
								</p>
							)}
						</div>
					</div>
					<Button 
						type='submit' 
						disabled={changePasswordMutation.isPending}
					>
						{changePasswordMutation.isPending
							? 'Saving\u2026'
							: 'Update Password'}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
