import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export interface Column<T> {
	header: string;
	render: (row: T) => React.ReactNode;
	className?: string;
	headerClassName?: string;
}

interface DataTableProps<T> {
	columns: Column<T>[];
	data: T[];
	isLoading?: boolean;
	emptyMessage?: string;
	onRowClick?: (row: T) => void;
	rowKey: (row: T) => string | number;
	skeletonRows?: number;
	/** Extra cell(s) at the end of each row — used for action buttons */
	renderActions?: (row: T) => React.ReactNode;
	/** Extra header cell for the actions column */
	actionsHeader?: string;
	/** Render a full-width detail row below a given data row. Return null to hide. */
	renderExpandedRow?: (row: T) => React.ReactNode;
	/** Key of the currently expanded row (matches rowKey output) */
	expandedRowKey?: string | number | null;
}

export function DataTable<T>({
	columns,
	data,
	isLoading = false,
	emptyMessage = 'No results.',
	onRowClick,
	rowKey,
	skeletonRows = 5,
	renderActions,
	actionsHeader,
	renderExpandedRow,
	expandedRowKey,
}: DataTableProps<T>) {
	const colCount = columns.length + (renderActions ? 1 : 0);

	return (
		<div className='bg-card border rounded-lg overflow-hidden'>
			<table className='w-full text-sm'>
				<thead className='border-b bg-muted/40'>
					<tr>
						{columns.map((col, i) => (
							<th
								key={i}
								className={
									col.headerClassName ?? 'text-left px-4 py-3 font-medium'
								}
							>
								{col.header}
							</th>
						))}
						{renderActions && (
							<th className='w-10 text-left px-4 py-3 font-medium'>
								{actionsHeader ?? ''}
							</th>
						)}
					</tr>
				</thead>
				<tbody className='divide-y'>
					{isLoading
						? Array.from({ length: skeletonRows }).map((_, ri) => (
								<tr key={ri}>
									{Array.from({ length: colCount }).map((_, ci) => (
										<td key={ci} className='px-4 py-3'>
											<Skeleton className='h-4 w-full' />
										</td>
									))}
								</tr>
							))
						: data.map(row => (
								<React.Fragment key={rowKey(row)}>
									<tr
										className={`hover:bg-muted/20 ${onRowClick ? 'cursor-pointer' : ''}`}
										onClick={onRowClick ? () => onRowClick(row) : undefined}
									>
										{columns.map((col, ci) => (
											<td key={ci} className={col.className ?? 'px-4 py-3'}>
												{col.render(row)}
											</td>
										))}
										{renderActions && (
											<td
												className='px-2 py-3'
												onClick={
													onRowClick ? e => e.stopPropagation() : undefined
												}
											>
												{renderActions(row)}
											</td>
										)}
									</tr>
									{renderExpandedRow && expandedRowKey === rowKey(row) && (
										<tr>
											<td colSpan={colCount} className='px-0 py-0 border-t-0'>
												{renderExpandedRow(row)}
											</td>
										</tr>
									)}
								</React.Fragment>
							))}
				</tbody>
			</table>
			{!isLoading && data.length === 0 && (
				<p className='text-center text-muted-foreground py-10'>
					{emptyMessage}
				</p>
			)}
		</div>
	);
}
