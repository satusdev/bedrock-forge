import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	children: React.ReactNode;
	className?: string;
}

const Dialog: React.FC<DialogProps> = ({
	open,
	onOpenChange,
	title,
	children,
	className,
}) => {
	if (!open) {
		return null;
	}

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
			<div
				className={cn(
					'w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl dark:bg-gray-900 dark:border-gray-700',
					className,
				)}
			>
				<div className='flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700'>
					<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
						{title}
					</h3>
					<button
						type='button'
						className='rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
						onClick={() => onOpenChange(false)}
					>
						<X className='h-4 w-4' />
					</button>
				</div>
				<div className='px-6 py-4'>{children}</div>
			</div>
		</div>
	);
};

export default Dialog;
