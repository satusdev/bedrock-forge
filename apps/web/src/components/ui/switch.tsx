import * as React from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	className?: string;
	disabled?: boolean;
	id?: string;
}

/**
 * Accessible toggle switch — no Radix peer dependency.
 * Uses role="switch" + aria-checked for a11y.
 */
export function Switch({
	checked,
	onCheckedChange,
	className,
	disabled,
	id,
}: SwitchProps) {
	return (
		<button
			id={id}
			type='button'
			role='switch'
			aria-checked={checked}
			disabled={disabled}
			onClick={() => !disabled && onCheckedChange(!checked)}
			className={cn(
				'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
				'disabled:cursor-not-allowed disabled:opacity-50',
				checked ? 'bg-primary' : 'bg-input',
				className,
			)}
		>
			<span
				className={cn(
					'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200',
					checked ? 'translate-x-4' : 'translate-x-0',
				)}
			/>
		</button>
	);
}
