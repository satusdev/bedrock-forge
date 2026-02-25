import React from 'react';

import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Input from '@/components/ui/Input';
import type { CreateMonitorForm } from './types';

interface MonitorFormDialogProps {
	open: boolean;
	formData: CreateMonitorForm;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onFormChange: (formData: CreateMonitorForm) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

const MonitorFormDialog: React.FC<MonitorFormDialogProps> = ({
	open,
	formData,
	isPending,
	onOpenChange,
	onFormChange,
	onSubmit,
}) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange} title='Add Monitor'>
			<form onSubmit={onSubmit} className='space-y-4'>
				<div>
					<label className='block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300'>
						Name
					</label>
					<Input
						type='text'
						value={formData.name}
						onChange={event =>
							onFormChange({ ...formData, name: event.target.value })
						}
						required
					/>
				</div>

				<div>
					<label className='block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300'>
						URL
					</label>
					<Input
						type='url'
						value={formData.url}
						onChange={event =>
							onFormChange({ ...formData, url: event.target.value })
						}
						placeholder='https://example.com'
						required
					/>
				</div>

				<div>
					<label className='block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300'>
						Check Interval
					</label>
					<select
						value={formData.interval_seconds}
						onChange={event =>
							onFormChange({
								...formData,
								interval_seconds: Number.parseInt(event.target.value, 10),
							})
						}
						className='w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100'
					>
						<option value={60}>1 minute</option>
						<option value={300}>5 minutes</option>
						<option value={600}>10 minutes</option>
						<option value={1800}>30 minutes</option>
						<option value={3600}>1 hour</option>
					</select>
				</div>

				<div className='flex justify-end space-x-3 pt-4'>
					<Button
						type='button'
						variant='secondary'
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type='submit'
						variant='primary'
						disabled={isPending}
						loading={isPending}
					>
						{isPending ? 'Creating...' : 'Create Monitor'}
					</Button>
				</div>
			</form>
		</Dialog>
	);
};

export default MonitorFormDialog;
