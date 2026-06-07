import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card';
import { LogResult } from '../types';
import { toolsApi } from '../api';

export function ErrorLogsCard({
	selectedEnvId,
}: {
	selectedEnvId: number | null;
}) {
	const [logType, setLogType] = useState<'debug' | 'php' | 'nginx' | 'apache'>(
		'debug',
	);
	const [logLines, setLogLines] = useState('100');
	const [logOutput, setLogOutput] = useState<LogResult | null>(null);

	const logsMutation = useMutation({
		mutationFn: () =>
			toolsApi.getLogs(selectedEnvId!, logType, logLines),
		onSuccess: (data: LogResult) => setLogOutput(data),
		onError: () =>
			toast({ title: 'Failed to fetch logs', variant: 'destructive' }),
	});

	return (
		<Card>
			<CardHeader className='pb-3'>
				<CardTitle className='flex items-center gap-2 text-base'>
					<FileText className='h-4 w-4' />
					Error Logs
				</CardTitle>
				<CardDescription>
					Fetch and display recent log file entries
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-3'>
				<div className='flex flex-wrap items-center gap-3'>
					<Select
						value={logType}
						onValueChange={v => setLogType(v as typeof logType)}
					>
						<SelectTrigger className='w-32'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='debug'>WP Debug</SelectItem>
							<SelectItem value='php'>PHP Error</SelectItem>
							<SelectItem value='nginx'>Nginx</SelectItem>
							<SelectItem value='apache'>Apache</SelectItem>
						</SelectContent>
					</Select>
					<div className='flex items-center gap-2'>
						<Label className='text-sm text-muted-foreground'>Lines:</Label>
						<Input
							type='number'
							min='1'
							max='500'
							value={logLines}
							onChange={e => setLogLines(e.target.value)}
							className='w-20 h-9'
						/>
					</div>
					<Button
						variant='outline'
						size='sm'
						disabled={logsMutation.isPending || !selectedEnvId}
						onClick={() => logsMutation.mutate()}
					>
						{logsMutation.isPending ? (
							<Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
						) : (
							<FileText className='h-3.5 w-3.5 mr-1' />
						)}
						Fetch Logs
					</Button>
					{logOutput && (
						<span className='text-xs text-muted-foreground'>
							{logOutput.file}
						</span>
					)}
				</div>
				{logOutput && (
					<pre className='bg-muted text-xs rounded-md p-3 overflow-auto max-h-72 font-mono whitespace-pre-wrap'>
						{logOutput.lines?.length
							? logOutput.lines.join('\n')
							: (logOutput.error ?? 'No output')}
					</pre>
				)}
			</CardContent>
		</Card>
	);
}
