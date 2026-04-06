import * as React from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface AlertDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirmLabel?: string;
	confirmVariant?: 'default' | 'destructive';
	onConfirm: () => void;
	isPending?: boolean;
}

/**
 * Lightweight alert/confirm dialog built atop the base Dialog primitive.
 * No @radix-ui/react-alert-dialog dependency required.
 */
export function AlertDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = 'Confirm',
	confirmVariant = 'destructive',
	onConfirm,
	isPending = false,
}: AlertDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant='outline'
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						variant={confirmVariant}
						onClick={onConfirm}
						disabled={isPending}
					>
						{isPending ? 'Processing…' : confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
