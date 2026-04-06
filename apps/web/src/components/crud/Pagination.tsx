import { Button } from '@/components/ui/button';

interface PaginationProps {
	page: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}

export function Pagination({
	page,
	totalPages,
	onPageChange,
}: PaginationProps) {
	if (totalPages <= 1) return null;

	return (
		<div className='flex items-center justify-between text-sm'>
			<Button
				variant='outline'
				size='sm'
				onClick={() => onPageChange(Math.max(1, page - 1))}
				disabled={page === 1}
			>
				Previous
			</Button>
			<span className='text-muted-foreground'>
				Page {page} of {totalPages}
			</span>
			<Button
				variant='outline'
				size='sm'
				onClick={() => onPageChange(Math.min(totalPages, page + 1))}
				disabled={page === totalPages}
			>
				Next
			</Button>
		</div>
	);
}
