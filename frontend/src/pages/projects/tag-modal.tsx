import Button from '@/components/ui/Button';
import type { RemoteProject, TagOption } from './types';

interface ProjectTagModalProps {
	open: boolean;
	project: RemoteProject | null;
	tagOptions: TagOption[];
	selectedTagIds: number[];
	isLoading: boolean;
	isSaving: boolean;
	onClose: () => void;
	onToggleTag: (tagId: number) => void;
	onSave: () => void;
}

export function ProjectTagModal({
	open,
	project,
	tagOptions,
	selectedTagIds,
	isLoading,
	isSaving,
	onClose,
	onToggleTag,
	onSave,
}: ProjectTagModalProps) {
	if (!open || !project) {
		return null;
	}

	return (
		<div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
			<div className='bg-white rounded-lg p-6 max-w-lg w-full mx-4'>
				<div className='flex items-center justify-between mb-4'>
					<h3 className='text-lg font-medium text-gray-900'>Project Tags</h3>
					<Button variant='ghost' size='sm' onClick={onClose}>
						✕
					</Button>
				</div>

				<p className='text-sm text-gray-500 mb-4'>
					{project.name} • {project.domain}
				</p>

				{isLoading ? (
					<div className='text-sm text-gray-500'>Loading tags...</div>
				) : (
					<div className='flex flex-wrap gap-2'>
						{tagOptions.length === 0 && (
							<span className='text-sm text-gray-500'>No tags available</span>
						)}
						{tagOptions.map(tag => (
							<button
								key={tag.id}
								type='button'
								onClick={() => onToggleTag(tag.id)}
								className={`inline-flex items-center px-3 py-1 rounded-full text-sm border transition ${
									selectedTagIds.includes(tag.id)
										? 'border-transparent text-white'
										: 'border-gray-300 text-gray-700'
								}`}
								style={{
									backgroundColor: selectedTagIds.includes(tag.id)
										? tag.color
										: 'transparent',
								}}
							>
								{tag.name}
							</button>
						))}
					</div>
				)}

				<div className='flex justify-end space-x-3 mt-6'>
					<Button variant='secondary' onClick={onClose}>
						Cancel
					</Button>
					<Button variant='primary' onClick={onSave} disabled={isSaving}>
						{isSaving ? 'Saving...' : 'Save Tags'}
					</Button>
				</div>
			</div>
		</div>
	);
}
