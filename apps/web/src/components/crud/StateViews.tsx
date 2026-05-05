import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

// ─── EmptyState ────────────────────────────────────────────────────────────────

interface EmptyStateProps {
	icon?: React.ElementType;
	title?: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
}

export function EmptyState({
	icon: Icon = Inbox,
	title = 'No results',
	description,
	action,
	className = '',
}: EmptyStateProps) {
	return (
		<div
			className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}
		>
			<div className='rounded-full bg-muted p-4'>
				<Icon className='h-6 w-6 text-muted-foreground' />
			</div>
			<div>
				<p className='text-sm font-medium text-foreground'>{title}</p>
				{description && (
					<p className='mt-1 text-xs text-muted-foreground'>{description}</p>
				)}
			</div>
			{action && <div>{action}</div>}
		</div>
	);
}

// ─── ErrorState ──────────────────────────────────────────────────────────────

interface ErrorStateProps {
	title?: string;
	description?: string;
	onRetry?: () => void;
	className?: string;
}

export function ErrorState({
	title = 'Something went wrong',
	description = 'An error occurred while loading data. Please try again.',
	onRetry,
	className = '',
}: ErrorStateProps) {
	return (
		<div
			className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}
		>
			<div className='rounded-full bg-destructive/10 p-4'>
				<AlertCircle className='h-6 w-6 text-destructive' />
			</div>
			<div>
				<p className='text-sm font-medium text-foreground'>{title}</p>
				{description && (
					<p className='mt-1 text-xs text-muted-foreground'>{description}</p>
				)}
			</div>
			{onRetry && (
				<Button
					variant='outline'
					size='sm'
					onClick={onRetry}
					className='gap-1.5'
				>
					<RefreshCw className='h-3.5 w-3.5' />
					Retry
				</Button>
			)}
		</div>
	);
}

// ─── LoadingState ─────────────────────────────────────────────────────────────

interface LoadingStateProps {
	rows?: number;
	cols?: number;
	className?: string;
}

export function LoadingState({
	rows = 5,
	cols = 3,
	className = '',
}: LoadingStateProps) {
	return (
		<div className={`space-y-2 ${className}`}>
			{Array.from({ length: rows }).map((_, ri) => (
				<div key={ri} className='flex gap-3'>
					{Array.from({ length: cols }).map((_, ci) => (
						<Skeleton key={ci} className='h-9 flex-1 rounded' />
					))}
				</div>
			))}
		</div>
	);
}

// ─── QueryStateRenderer ───────────────────────────────────────────────────────

interface QueryStateRendererProps<T> {
	isLoading: boolean;
	isError: boolean;
	data: T | undefined;
	isEmpty: (data: T) => boolean;
	onRetry?: () => void;
	loadingRows?: number;
	loadingCols?: number;
	emptyTitle?: string;
	emptyDescription?: string;
	emptyIcon?: React.ElementType;
	emptyAction?: React.ReactNode;
	errorTitle?: string;
	errorDescription?: string;
	children: (data: T) => React.ReactNode;
}

export function QueryStateRenderer<T>({
	isLoading,
	isError,
	data,
	isEmpty,
	onRetry,
	loadingRows = 5,
	loadingCols = 3,
	emptyTitle,
	emptyDescription,
	emptyIcon,
	emptyAction,
	errorTitle,
	errorDescription,
	children,
}: QueryStateRendererProps<T>) {
	if (isLoading) {
		return <LoadingState rows={loadingRows} cols={loadingCols} />;
	}
	if (isError) {
		return (
			<ErrorState
				title={errorTitle}
				description={errorDescription}
				onRetry={onRetry}
			/>
		);
	}
	if (!data || isEmpty(data)) {
		return (
			<EmptyState
				icon={emptyIcon}
				title={emptyTitle}
				description={emptyDescription}
				action={emptyAction}
			/>
		);
	}
	return <>{children(data)}</>;
}
