import React from 'react';
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	useReactTable,
	type PaginationState,
} from '@tanstack/react-table';

import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/Table';

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	showFilter?: boolean;
	filterPlaceholder?: string;
	filterValue: string;
	onFilterChange: (value: string) => void;
	emptyMessage?: string;
	initialPageSize?: number;
}

function DataTable<TData, TValue>({
	columns,
	data,
	showFilter = true,
	filterPlaceholder = 'Filter...',
	filterValue,
	onFilterChange,
	emptyMessage = 'No results.',
	initialPageSize = 10,
}: DataTableProps<TData, TValue>) {
	const [pagination, setPagination] = React.useState<PaginationState>({
		pageIndex: 0,
		pageSize: initialPageSize,
	});

	const table = useReactTable({
		data,
		columns,
		state: {
			globalFilter: filterValue,
			pagination,
		},
		onGlobalFilterChange: onFilterChange,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		globalFilterFn: 'includesString',
	});

	return (
		<div className='space-y-4'>
			{showFilter && (
				<div className='flex items-center gap-4'>
					<Input
						placeholder={filterPlaceholder}
						value={filterValue}
						onChange={event => onFilterChange(event.target.value)}
						className='max-w-sm'
					/>
				</div>
			)}

			<div className='overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'>
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map(headerGroup => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map(header => {
									return (
										<TableHead key={header.id}>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map(row => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map(cell => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className='h-28 text-center text-sm text-gray-500 dark:text-gray-400'
								>
									{emptyMessage}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<div className='flex items-center justify-between gap-3'>
				<div className='text-sm text-gray-500 dark:text-gray-400'>
					Showing {table.getRowModel().rows.length} of {data.length} result
					{data.length === 1 ? '' : 's'}
				</div>
				<div className='flex items-center gap-3'>
					<div className='text-sm text-gray-500 dark:text-gray-400'>
						Page {table.getState().pagination.pageIndex + 1} of{' '}
						{table.getPageCount() || 1}
					</div>
					<Button
						variant='outline'
						size='sm'
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
					>
						Previous
					</Button>
					<Button
						variant='outline'
						size='sm'
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}

export default DataTable;
