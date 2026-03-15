import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
	'inline-flex items-center justify-center whitespace-nowrap rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				primary:
					'bg-primary-600 text-white border-transparent hover:bg-primary-700',
				secondary:
					'bg-gray-200 text-gray-800 border-gray-300 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600',
				danger: 'bg-red-600 text-white border-transparent hover:bg-red-700',
				ghost:
					'bg-transparent border-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
				outline:
					'bg-transparent text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-800 dark:hover:border-gray-500',
			},
			size: {
				sm: 'h-8 px-3',
				md: 'h-10 px-4',
				lg: 'h-11 px-6',
			},
		},
		defaultVariants: {
			variant: 'primary',
			size: 'md',
		},
	},
);

export interface ButtonProps
	extends
		React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	loading?: boolean;
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant,
			size,
			loading = false,
			disabled,
			children,
			asChild = false,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? Slot : 'button';

		return (
			<Comp
				ref={ref}
				className={cn(buttonVariants({ variant, size }), className)}
				disabled={disabled || loading}
				{...props}
			>
				{loading && (
					<svg
						className='animate-spin -ml-1 mr-2 h-4 w-4'
						xmlns='http://www.w3.org/2000/svg'
						fill='none'
						viewBox='0 0 24 24'
					>
						<circle
							className='opacity-25'
							cx='12'
							cy='12'
							r='10'
							stroke='currentColor'
							strokeWidth='4'
						/>
						<path
							className='opacity-75'
							fill='currentColor'
							d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
						/>
					</svg>
				)}
				{children}
			</Comp>
		);
	},
);

Button.displayName = 'Button';

export { buttonVariants };
export default Button;
