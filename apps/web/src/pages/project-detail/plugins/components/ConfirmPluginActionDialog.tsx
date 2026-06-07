import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';

export function ConfirmPluginActionDialog({
	open,
	onClose,
	onConfirm,
	title,
	description,
	isPending,
}: {
	open: boolean;
	onClose: () => void;
	onConfirm: (skipSafetyBackup: boolean) => void;
	title: string;
	description: string;
	isPending: boolean;
}) {
	const [skipSafetyBackup, setSkipSafetyBackup] = useState(true);

	return (
		<Dialog open={open} onOpenChange={v => !v && onClose()}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<div className='py-4 space-y-4'>
					<p className='text-sm text-muted-foreground'>{description}</p>
					<div className='flex items-center space-x-2'>
						<Checkbox
							id='action-skip-backup'
							checked={skipSafetyBackup}
							onCheckedChange={(checked) => setSkipSafetyBackup(checked as boolean)}
							disabled={isPending}
						/>
						<label
							htmlFor='action-skip-backup'
							className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
						>
							Skip pre-flight safety backup
						</label>
					</div>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button onClick={() => onConfirm(skipSafetyBackup)} disabled={isPending}>
						{isPending && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
