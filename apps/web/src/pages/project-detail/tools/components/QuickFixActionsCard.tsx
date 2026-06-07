import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { TerminalSquare, Loader2, Play } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card';
import { WP_FIX_ACTIONS } from '../utils';
import { toolsApi } from '../api';

export function QuickFixActionsCard({
	selectedEnvId,
}: {
	selectedEnvId: number | null;
}) {
	const [lastFixResult, setLastFixResult] = useState<
		Record<string, 'success' | 'error'>
	>({});

	const fixMutation = useMutation({
		mutationFn: ({ action }: { action: string }) =>
			toolsApi.runQuickFix(selectedEnvId!, action),
		onSuccess: (_, { action }) => {
			setLastFixResult(p => ({ ...p, [action]: 'success' }));
			toast({
				title: 'Action queued',
				description: `"${action}" is running in background`,
			});
		},
		onError: (_, { action }) => {
			setLastFixResult(p => ({ ...p, [action]: 'error' }));
			toast({ title: 'Failed to queue action', variant: 'destructive' });
		},
	});

	return (
		<Card>
			<CardHeader className='pb-3'>
				<CardTitle className='flex items-center gap-2 text-base'>
					<TerminalSquare className='h-4 w-4' />
					Quick Fix Actions
				</CardTitle>
				<CardDescription>
					Run one-click WordPress maintenance actions remotely
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
					{WP_FIX_ACTIONS.map(({ value, label, description }) => {
						const result = lastFixResult[value];
						return (
							<div
								key={value}
								className='flex flex-col gap-1.5 p-3 border rounded-md bg-muted/30'
							>
								<div className='flex items-center justify-between'>
									<span className='text-sm font-medium'>{label}</span>
									{result === 'success' && (
										<Badge
											variant='outline'
											className='text-xs text-green-600 border-green-500'
										>
											Queued
										</Badge>
									)}
									{result === 'error' && (
										<Badge variant='destructive' className='text-xs'>
											Failed
										</Badge>
									)}
								</div>
								<p className='text-xs text-muted-foreground'>{description}</p>
								<Button
									variant='outline'
									size='sm'
									className='mt-1 self-start'
									disabled={!selectedEnvId || fixMutation.isPending}
									onClick={() => fixMutation.mutate({ action: value })}
								>
									{fixMutation.isPending &&
									fixMutation.variables?.action === value ? (
										<Loader2 className='h-3 w-3 animate-spin mr-1' />
									) : (
										<Play className='h-3 w-3 mr-1' />
									)}
									Run
								</Button>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
