import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

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
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className='fixed inset-0 z-50 bg-black/50' />
				<DialogPrimitive.Content
					className={cn(
						'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white shadow-xl dark:bg-gray-900 dark:border-gray-700',
						className,
					)}
				>
					<div className='flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700'>
						<DialogPrimitive.Title className='text-lg font-semibold text-gray-900 dark:text-white'>
							{title}
						</DialogPrimitive.Title>
						<DialogPrimitive.Close
							type='button'
							className='rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
						>
							<X className='h-4 w-4' />
						</DialogPrimitive.Close>
					</div>
					<div className='px-6 py-4'>{children}</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
};

export default Dialog;
