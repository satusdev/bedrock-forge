import { useMutation } from '@tanstack/react-query';
import { Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card';
import { toolsApi } from '../api';

export function DbCleanupCard({
	selectedEnvId,
}: {
	selectedEnvId: number | null;
}) {
	const cleanupMutation = useMutation({
		mutationFn: ({ dryRun }: { dryRun: boolean }) =>
			toolsApi.runCleanup(selectedEnvId!, dryRun),
		onSuccess: () => toast({ title: 'Cleanup job queued' }),
		onError: () => toast({ title: 'Failed to queue cleanup job', variant: 'destructive' }),
	});

	return (
		<Card>
			<CardHeader className='pb-3'>
				<CardTitle className='flex items-center gap-2 text-base'>
					<Trash2 className='h-4 w-4' />
					DB Cleanup
				</CardTitle>
				<CardDescription>
					Remove post revisions, expired transients, spam comments, and
					orphaned postmeta
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className='flex flex-wrap gap-3'>
					<Button
						variant='outline'
						size='sm'
						disabled={cleanupMutation.isPending || !selectedEnvId}
						onClick={() => cleanupMutation.mutate({ dryRun: true })}
					>
						{cleanupMutation.isPending &&
						cleanupMutation.variables?.dryRun ? (
							<Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
						) : (
							<RefreshCw className='h-3.5 w-3.5 mr-1' />
						)}
						Dry Run (count only)
					</Button>
					<Button
						variant='destructive'
						size='sm'
						disabled={cleanupMutation.isPending || !selectedEnvId}
						onClick={() => cleanupMutation.mutate({ dryRun: false })}
					>
						{cleanupMutation.isPending &&
						!cleanupMutation.variables?.dryRun ? (
							<Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
						) : (
							<Trash2 className='h-3.5 w-3.5 mr-1' />
						)}
						Run Cleanup
					</Button>
					<p className='text-xs text-muted-foreground self-center'>
						Results visible in the Activity log once the job completes.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
