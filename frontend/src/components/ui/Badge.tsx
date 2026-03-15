import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
	'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
	{
		variants: {
			variant: {
				success:
					'border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
				warning:
					'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
				error:
					'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
				info: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
				default:
					'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
				danger:
					'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
				secondary:
					'border-transparent bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

interface BadgeProps {
	children: React.ReactNode;
	className?: string;
}

type BadgeVariantProps = VariantProps<typeof badgeVariants>;

const Badge: React.FC<BadgeProps & BadgeVariantProps> = ({
	children,
	className,
	variant,
}) => {
	return (
		<span className={cn(badgeVariants({ variant }), className)}>
			{children}
		</span>
	);
};

export default Badge;
