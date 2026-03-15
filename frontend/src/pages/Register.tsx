/**
 * Register Page
 * Modern registration form with email, username, and password.
 */
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from '@/router/compat';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function Register() {
	const navigate = useNavigate();
	const { register, isLoading, error, clearError } = useAuthStore();

	const [formData, setFormData] = useState({
		email: '',
		username: '',
		password: '',
		confirmPassword: '',
		full_name: '',
	});

	const [passwordError, setPasswordError] = useState('');

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		clearError();
		setPasswordError('');

		if (formData.password !== formData.confirmPassword) {
			setPasswordError('Passwords do not match');
			return;
		}

		if (formData.password.length < 8) {
			setPasswordError('Password must be at least 8 characters');
			return;
		}

		try {
			await register({
				email: formData.email,
				username: formData.username,
				password: formData.password,
				full_name: formData.full_name || undefined,
			});
			toast.success('Account created successfully!');
			navigate('/', { replace: true });
		} catch (err) {
			// Error handled by store
		}
	};

	return (
		<div className='min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-12 px-4'>
			<div className='w-full max-w-md'>
				{/* Logo/Brand */}
				<div className='text-center mb-8'>
					<h1 className='text-3xl font-bold text-white mb-2'>
						🔨 Bedrock Forge
					</h1>
					<p className='text-gray-400'>Create your account</p>
				</div>

				{/* Register Card */}
				<div className='bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 shadow-xl'>
					<h2 className='text-2xl font-semibold text-white mb-6'>Sign Up</h2>

					{(error || passwordError) && (
						<div className='mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm'>
							{error || passwordError}
						</div>
					)}

					<form onSubmit={handleSubmit} className='space-y-4'>
						<div>
							<label className='block text-sm font-medium text-gray-300 mb-2'>
								Full Name <span className='text-gray-500'>(optional)</span>
							</label>
							<input
								type='text'
								value={formData.full_name}
								onChange={e =>
									setFormData({ ...formData, full_name: e.target.value })
								}
								className='w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition'
								placeholder='John Doe'
							/>
						</div>

						<div>
							<label className='block text-sm font-medium text-gray-300 mb-2'>
								Email
							</label>
							<input
								type='email'
								value={formData.email}
								onChange={e =>
									setFormData({ ...formData, email: e.target.value })
								}
								className='w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition'
								placeholder='you@example.com'
								required
							/>
						</div>

						<div>
							<label className='block text-sm font-medium text-gray-300 mb-2'>
								Username
							</label>
							<input
								type='text'
								value={formData.username}
								onChange={e =>
									setFormData({ ...formData, username: e.target.value })
								}
								className='w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition'
								placeholder='johndoe'
								minLength={3}
								required
							/>
						</div>

						<div>
							<label className='block text-sm font-medium text-gray-300 mb-2'>
								Password
							</label>
							<input
								type='password'
								value={formData.password}
								onChange={e =>
									setFormData({ ...formData, password: e.target.value })
								}
								className='w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition'
								placeholder='••••••••'
								minLength={8}
								required
							/>
						</div>

						<div>
							<label className='block text-sm font-medium text-gray-300 mb-2'>
								Confirm Password
							</label>
							<input
								type='password'
								value={formData.confirmPassword}
								onChange={e =>
									setFormData({ ...formData, confirmPassword: e.target.value })
								}
								className='w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition'
								placeholder='••••••••'
								required
							/>
						</div>

						<button
							type='submit'
							disabled={isLoading}
							className='w-full py-3 px-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white font-medium rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6'
						>
							{isLoading ? (
								<>
									<svg className='animate-spin h-5 w-5' viewBox='0 0 24 24'>
										<circle
											className='opacity-25'
											cx='12'
											cy='12'
											r='10'
											stroke='currentColor'
											strokeWidth='4'
											fill='none'
										/>
										<path
											className='opacity-75'
											fill='currentColor'
											d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
										/>
									</svg>
									Creating account...
								</>
							) : (
								'Create Account'
							)}
						</button>
					</form>

					<div className='mt-6 text-center'>
						<p className='text-gray-400 text-sm'>
							Already have an account?{' '}
							<Link
								to='/login'
								className='text-blue-400 hover:text-blue-300 font-medium'
							>
								Sign in
							</Link>
						</p>
					</div>
				</div>

				<p className='mt-6 text-center text-gray-500 text-sm'>
					© 2024 Bedrock Forge. All rights reserved.
				</p>
			</div>
		</div>
	);
}
