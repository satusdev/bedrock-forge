import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
	title: string;
	onCreate?: () => void;
	createLabel?: string;
	children?: React.ReactNode;
}

export function PageHeader({
	title,
	onCreate,
	createLabel,
	children,
}: PageHeaderProps) {
	return (
		<div className='flex items-center justify-between gap-4'>
			<h1 className='text-2xl font-bold'>{title}</h1>
			<div className='flex items-center gap-2'>
				{children}
				{onCreate && (
					<Button onClick={onCreate} size='sm'>
						<Plus className='h-4 w-4 mr-1.5' />
						{createLabel ?? `New ${title.replace(/s$/, '')}`}
					</Button>
				)}
			</div>
		</div>
	);
}
