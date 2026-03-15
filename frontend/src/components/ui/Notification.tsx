import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import Button from './Button';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationProps {
	type: NotificationType;
	message: string;
	description?: string;
	onClose?: () => void;
	duration?: number;
	action?: {
		label: string;
		onClick: () => void;
	};
}

const notificationVariants = cva(
	'flex items-start rounded-lg border p-4 shadow-sm',
	{
		variants: {
			type: {
				success:
					'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200',
				error:
					'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200',
				warning:
					'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
				info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
			},
		},
	},
);

const iconVariants = cva('h-5 w-5', {
	variants: {
		type: {
			success: 'text-green-600 dark:text-green-400',
			error: 'text-red-600 dark:text-red-400',
			warning: 'text-yellow-600 dark:text-yellow-400',
			info: 'text-blue-600 dark:text-blue-400',
		},
	},
});

const Notification: React.FC<NotificationProps> = ({
	type,
	message,
	description,
	onClose,
	duration,
	action,
}) => {
	React.useEffect(() => {
		if (!duration || !onClose) {
			return;
		}

		const timer = window.setTimeout(() => {
			onClose();
		}, duration);

		return () => {
			window.clearTimeout(timer);
		};
	}, [duration, onClose]);

	const icon = (() => {
		switch (type) {
			case 'success':
				return <CheckCircle className={iconVariants({ type })} />;
			case 'error':
				return <AlertCircle className={iconVariants({ type })} />;
			case 'warning':
				return <AlertTriangle className={iconVariants({ type })} />;
			case 'info':
				return <Info className={iconVariants({ type })} />;
		}
	})();

	return (
		<div className={notificationVariants({ type })}>
			<div className='shrink-0'>{icon}</div>

			<div className='ml-3 flex-1'>
				<p className='text-sm font-medium'>{message}</p>

				{description && (
					<p className='mt-1 text-sm opacity-80'>{description}</p>
				)}

				{action && (
					<div className='mt-3'>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={action.onClick}
							className='h-auto px-0 py-0 text-inherit underline hover:no-underline'
						>
							{action.label}
						</Button>
					</div>
				)}
			</div>
			{onClose && (
				<div className='ml-4 shrink-0'>
					<Button
						type='button'
						variant='ghost'
						size='sm'
						onClick={onClose}
						className={cn(
							'h-auto p-0 text-inherit opacity-70 hover:opacity-100',
						)}
					>
						<X className='h-4 w-4' />
					</Button>
				</div>
			)}
		</div>
	);
};

export default Notification;
