import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	onSearch: () => void;
	onClear: () => void;
	placeholder?: string;
	totalCount?: number;
	totalLabel?: string;
}

export function SearchBar({
	value,
	onChange,
	onSearch,
	onClear,
	placeholder = 'Search…',
	totalCount,
	totalLabel = 'results',
}: SearchBarProps) {
	return (
		<div className='space-y-2'>
			<form
				onSubmit={e => {
					e.preventDefault();
					onSearch();
				}}
				className='flex gap-2 max-w-sm'
			>
				<div className='relative flex-1'>
					<Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
					<Input
						className='pl-8'
						placeholder={placeholder}
						value={value}
						onChange={e => onChange(e.target.value)}
					/>
				</div>
				<Button type='submit' variant='outline' size='sm'>
					Search
				</Button>
				{value && (
					<Button type='button' variant='ghost' size='sm' onClick={onClear}>
						Clear
					</Button>
				)}
			</form>
			{totalCount !== undefined && (
				<p className='text-sm text-muted-foreground'>
					{totalCount} {totalLabel}
				</p>
			)}
		</div>
	);
}
