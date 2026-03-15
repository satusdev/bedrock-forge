import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
	children: React.ReactNode;
	className?: string;
	title?: string;
	subtitle?: string;
	actions?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({
	children,
	className = '',
	title,
	subtitle,
	actions,
}) => {
	return (
		<div
			className={cn(
				'rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
				className,
			)}
		>
			{(title || subtitle || actions) && (
				<div className='flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700'>
					<div>
						{title && (
							<h3 className='text-lg font-semibold leading-none tracking-tight'>
								{title}
							</h3>
						)}
						{subtitle && (
							<p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
								{subtitle}
							</p>
						)}
					</div>
					{actions && <div className='ml-auto'>{actions}</div>}
				</div>
			)}
			<div className='px-6 py-4'>{children}</div>
		</div>
	);
};

export default Card;
