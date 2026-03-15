import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const labelVariants = cva(
	'text-sm font-medium leading-none text-gray-700 dark:text-gray-200 peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
	{
		variants: {
			required: {
				true: "after:content-['*'] after:ml-1 after:text-red-500",
				false: '',
			},
		},
		defaultVariants: {
			required: false,
		},
	},
);

const Label = React.forwardRef<
	React.ElementRef<typeof LabelPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
		VariantProps<typeof labelVariants>
>(({ className, required, ...props }, ref) => (
	<LabelPrimitive.Root
		ref={ref}
		className={cn(labelVariants({ required }), className)}
		{...props}
	/>
));

Label.displayName = LabelPrimitive.Root.displayName;

export default Label;
