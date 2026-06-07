import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { Environment } from '../types';

export function EnvCard({ env, label }: { env: Environment | null; label: string }) {
	if (!env) {
		return (
			<div className='flex-1 border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm'>
				{label}
			</div>
		);
	}
	return (
		<div className='flex-1 border rounded-lg p-5 space-y-1'>
			<p className='text-xs text-muted-foreground font-medium uppercase tracking-wide'>
				{label}
			</p>
			<p className='font-semibold capitalize text-lg'>{env.type}</p>
			<p className='text-sm text-muted-foreground'>{env.server.name}</p>
			{env.url && <p className='text-xs text-blue-500 truncate'>{env.url}</p>}
		</div>
	);
}

export function StatusIcon({ status }: { status: string }) {
	if (status === 'completed')
		return (
			<CheckCircle2 className='h-3.5 w-3.5 text-green-600 dark:text-green-400' />
		);
	if (status === 'failed')
		return <XCircle className='h-3.5 w-3.5 text-destructive' />;
	if (status === 'active')
		return <Loader2 className='h-3.5 w-3.5 text-blue-500 animate-spin' />;
	return <Clock className='h-3.5 w-3.5 text-muted-foreground' />;
}
