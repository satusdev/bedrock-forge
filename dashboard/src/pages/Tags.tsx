import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Tag,
	Plus,
	Edit,
	Trash2,
	Search,
	Palette,
	Hash,
	Loader2,
	Sparkles,
	FolderKanban,
	Server,
	AlertTriangle,
	Archive,
	Building,
	FlaskConical,
	Globe,
	Rocket,
	ShoppingCart,
	Users,
	Clock,
	CheckCircle,
	XCircle,
	Star,
	Zap,
	Heart,
	Flag,
	Bookmark,
	Target,
	Briefcase,
	Code,
	Database,
	Lock,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { dashboardApi } from '@/services/api';
import toast from 'react-hot-toast';

interface TagData {
	id: number;
	name: string;
	slug: string;
	color: string;
	icon: string | null;
	description: string | null;
	usage_count: number;
	created_at: string;
}

// Available icons for tags
const AVAILABLE_ICONS = [
	{ name: 'Tag', icon: Tag },
	{ name: 'Globe', icon: Globe },
	{ name: 'ShoppingCart', icon: ShoppingCart },
	{ name: 'Users', icon: Users },
	{ name: 'Building', icon: Building },
	{ name: 'FlaskConical', icon: FlaskConical },
	{ name: 'Rocket', icon: Rocket },
	{ name: 'Archive', icon: Archive },
	{ name: 'AlertTriangle', icon: AlertTriangle },
	{ name: 'Star', icon: Star },
	{ name: 'Heart', icon: Heart },
	{ name: 'Flag', icon: Flag },
	{ name: 'Bookmark', icon: Bookmark },
	{ name: 'Target', icon: Target },
	{ name: 'Briefcase', icon: Briefcase },
	{ name: 'Code', icon: Code },
	{ name: 'Database', icon: Database },
	{ name: 'Lock', icon: Lock },
	{ name: 'Zap', icon: Zap },
	{ name: 'Clock', icon: Clock },
	{ name: 'CheckCircle', icon: CheckCircle },
	{ name: 'XCircle', icon: XCircle },
	{ name: 'FolderKanban', icon: FolderKanban },
	{ name: 'Server', icon: Server },
];

// Preset colors
const PRESET_COLORS = [
	'#ef4444', // Red
	'#f97316', // Orange
	'#f59e0b', // Amber
	'#eab308', // Yellow
	'#84cc16', // Lime
	'#22c55e', // Green
	'#10b981', // Emerald
	'#14b8a6', // Teal
	'#06b6d4', // Cyan
	'#0ea5e9', // Sky
	'#3b82f6', // Blue
	'#6366f1', // Indigo
	'#8b5cf6', // Violet
	'#a855f7', // Purple
	'#d946ef', // Fuchsia
	'#ec4899', // Pink
	'#f43f5e', // Rose
	'#6b7280', // Gray
];

const Tags: React.FC = () => {
	const queryClient = useQueryClient();
	const [searchQuery, setSearchQuery] = useState('');
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [editingTag, setEditingTag] = useState<TagData | null>(null);
	const [showIconPicker, setShowIconPicker] = useState(false);
	const [formData, setFormData] = useState({
		name: '',
		slug: '',
		color: '#6366f1',
		icon: 'Tag',
		description: '',
	});

	// Fetch tags
	const { data: tagsData, isLoading } = useQuery({
		queryKey: ['tags', searchQuery],
		queryFn: () => dashboardApi.getTags(searchQuery || undefined),
	});

	const tags = tagsData?.data || [];

	// Create tag mutation
	const createMutation = useMutation({
		mutationFn: (data: any) => dashboardApi.createTag(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['tags'] });
			toast.success('Tag created successfully');
			setShowCreateModal(false);
			resetForm();
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to create tag');
		},
	});

	// Update tag mutation
	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: any }) =>
			dashboardApi.updateTag(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['tags'] });
			toast.success('Tag updated successfully');
			setEditingTag(null);
			resetForm();
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to update tag');
		},
	});

	// Delete tag mutation
	const deleteMutation = useMutation({
		mutationFn: (id: number) => dashboardApi.deleteTag(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['tags'] });
			toast.success('Tag deleted successfully');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to delete tag');
		},
	});

	// Seed tags mutation
	const seedMutation = useMutation({
		mutationFn: () => dashboardApi.seedTags(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['tags'] });
			toast.success('Default tags created');
		},
		onError: () => {
			toast.error('Failed to seed tags');
		},
	});

	const resetForm = () => {
		setFormData({
			name: '',
			slug: '',
			color: '#6366f1',
			icon: 'Tag',
			description: '',
		});
		setShowIconPicker(false);
	};

	const generateSlug = (name: string) => {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '');
	};

	const handleNameChange = (name: string) => {
		setFormData({
			...formData,
			name,
			slug: editingTag ? formData.slug : generateSlug(name),
		});
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (editingTag) {
			updateMutation.mutate({ id: editingTag.id, data: formData });
		} else {
			createMutation.mutate(formData);
		}
	};

	const openEditModal = (tag: TagData) => {
		setEditingTag(tag);
		setFormData({
			name: tag.name,
			slug: tag.slug,
			color: tag.color,
			icon: tag.icon || 'Tag',
			description: tag.description || '',
		});
	};

	const getIconComponent = (iconName: string | null) => {
		const found = AVAILABLE_ICONS.find(i => i.name === iconName);
		return found ? found.icon : Tag;
	};

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<Loader2 className='w-8 h-8 animate-spin text-primary-600' />
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
				<div>
					<h1 className='text-2xl font-bold text-gray-900 dark:text-white'>
						Tags
					</h1>
					<p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
						Organize projects and servers with color-coded tags
					</p>
				</div>
				<div className='flex items-center gap-3'>
					{tags.length === 0 && (
						<Button
							variant='secondary'
							onClick={() => seedMutation.mutate()}
							disabled={seedMutation.isPending}
						>
							{seedMutation.isPending ? (
								<Loader2 className='w-4 h-4 mr-2 animate-spin' />
							) : (
								<Sparkles className='w-4 h-4 mr-2' />
							)}
							Seed Default Tags
						</Button>
					)}
					<Button onClick={() => setShowCreateModal(true)}>
						<Plus className='w-4 h-4 mr-2' />
						New Tag
					</Button>
				</div>
			</div>

			{/* Search */}
			<div className='relative max-w-md'>
				<Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
				<input
					type='text'
					value={searchQuery}
					onChange={e => setSearchQuery(e.target.value)}
					placeholder='Search tags...'
					className='w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent'
				/>
			</div>

			{/* Stats */}
			<div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
				<Card className='p-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg'>
							<Tag className='w-5 h-5 text-primary-600 dark:text-primary-400' />
						</div>
						<div>
							<p className='text-2xl font-bold text-gray-900 dark:text-white'>
								{tags.length}
							</p>
							<p className='text-sm text-gray-500 dark:text-gray-400'>
								Total Tags
							</p>
						</div>
					</div>
				</Card>
				<Card className='p-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg'>
							<FolderKanban className='w-5 h-5 text-emerald-600 dark:text-emerald-400' />
						</div>
						<div>
							<p className='text-2xl font-bold text-gray-900 dark:text-white'>
								{tags.reduce(
									(sum: number, t: TagData) => sum + t.usage_count,
									0
								)}
							</p>
							<p className='text-sm text-gray-500 dark:text-gray-400'>
								Total Usage
							</p>
						</div>
					</div>
				</Card>
				<Card className='p-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg'>
							<Palette className='w-5 h-5 text-amber-600 dark:text-amber-400' />
						</div>
						<div>
							<p className='text-2xl font-bold text-gray-900 dark:text-white'>
								{new Set(tags.map((t: TagData) => t.color)).size}
							</p>
							<p className='text-sm text-gray-500 dark:text-gray-400'>
								Unique Colors
							</p>
						</div>
					</div>
				</Card>
				<Card className='p-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg'>
							<Hash className='w-5 h-5 text-blue-600 dark:text-blue-400' />
						</div>
						<div>
							<p className='text-2xl font-bold text-gray-900 dark:text-white'>
								{tags.filter((t: TagData) => t.usage_count > 0).length}
							</p>
							<p className='text-sm text-gray-500 dark:text-gray-400'>In Use</p>
						</div>
					</div>
				</Card>
			</div>

			{/* Tags Grid */}
			{tags.length === 0 ? (
				<Card className='p-12 text-center'>
					<Tag className='w-12 h-12 mx-auto text-gray-400 mb-4' />
					<h3 className='text-lg font-medium text-gray-900 dark:text-white mb-2'>
						No tags yet
					</h3>
					<p className='text-gray-500 dark:text-gray-400 mb-4'>
						Create tags to organize your projects and servers
					</p>
					<div className='flex justify-center gap-3'>
						<Button variant='secondary' onClick={() => seedMutation.mutate()}>
							<Sparkles className='w-4 h-4 mr-2' />
							Seed Defaults
						</Button>
						<Button onClick={() => setShowCreateModal(true)}>
							<Plus className='w-4 h-4 mr-2' />
							Create Tag
						</Button>
					</div>
				</Card>
			) : (
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'>
					{tags.map((tag: TagData) => {
						const IconComponent = getIconComponent(tag.icon);
						return (
							<Card
								key={tag.id}
								className='p-4 hover:shadow-md transition-shadow'
							>
								<div className='flex items-start justify-between'>
									<div className='flex items-center gap-3'>
										<div
											className='w-10 h-10 rounded-lg flex items-center justify-center'
											style={{ backgroundColor: `${tag.color}20` }}
										>
											<IconComponent
												className='w-5 h-5'
												style={{ color: tag.color }}
											/>
										</div>
										<div>
											<h3 className='font-semibold text-gray-900 dark:text-white'>
												{tag.name}
											</h3>
											<p className='text-xs text-gray-500 dark:text-gray-400'>
												{tag.slug}
											</p>
										</div>
									</div>
									<div className='flex items-center gap-1'>
										<button
											onClick={() => openEditModal(tag)}
											className='p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded'
										>
											<Edit className='w-4 h-4' />
										</button>
										<button
											onClick={() => {
												if (
													confirm(
														`Delete tag "${tag.name}"? This will remove it from all projects and servers.`
													)
												) {
													deleteMutation.mutate(tag.id);
												}
											}}
											className='p-1.5 text-gray-400 hover:text-red-500 rounded'
										>
											<Trash2 className='w-4 h-4' />
										</button>
									</div>
								</div>

								{tag.description && (
									<p className='mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2'>
										{tag.description}
									</p>
								)}

								<div className='mt-3 flex items-center justify-between'>
									<div className='flex items-center gap-2'>
										<span
											className='inline-block w-3 h-3 rounded-full'
											style={{ backgroundColor: tag.color }}
										/>
										<span className='text-xs text-gray-500 dark:text-gray-400'>
											{tag.color}
										</span>
									</div>
									<span className='text-xs text-gray-500 dark:text-gray-400'>
										{tag.usage_count} use{tag.usage_count !== 1 ? 's' : ''}
									</span>
								</div>
							</Card>
						);
					})}
				</div>
			)}

			{/* Create/Edit Modal */}
			{(showCreateModal || editingTag) && (
				<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
					<div className='bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6 mx-4'>
						<h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
							{editingTag ? 'Edit Tag' : 'Create Tag'}
						</h3>

						<form onSubmit={handleSubmit} className='space-y-4'>
							{/* Name */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Name
								</label>
								<input
									type='text'
									value={formData.name}
									onChange={e => handleNameChange(e.target.value)}
									placeholder='e.g., Production'
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
									required
								/>
							</div>

							{/* Slug */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Slug
								</label>
								<input
									type='text'
									value={formData.slug}
									onChange={e =>
										setFormData({ ...formData, slug: e.target.value })
									}
									placeholder='e.g., production'
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
									required
								/>
							</div>

							{/* Color */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Color
								</label>
								<div className='flex items-center gap-3'>
									<input
										type='color'
										value={formData.color}
										onChange={e =>
											setFormData({ ...formData, color: e.target.value })
										}
										className='w-12 h-10 border border-gray-300 dark:border-gray-600 rounded cursor-pointer'
									/>
									<input
										type='text'
										value={formData.color}
										onChange={e =>
											setFormData({ ...formData, color: e.target.value })
										}
										className='w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm'
									/>
								</div>
								<div className='flex flex-wrap gap-2 mt-2'>
									{PRESET_COLORS.map(color => (
										<button
											key={color}
											type='button'
											onClick={() => setFormData({ ...formData, color })}
											className={`w-6 h-6 rounded-full border-2 ${
												formData.color === color
													? 'border-gray-900 dark:border-white'
													: 'border-transparent'
											}`}
											style={{ backgroundColor: color }}
										/>
									))}
								</div>
							</div>

							{/* Icon */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Icon
								</label>
								<div className='relative'>
									<button
										type='button'
										onClick={() => setShowIconPicker(!showIconPicker)}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white flex items-center gap-2'
									>
										{(() => {
											const IconComp = getIconComponent(formData.icon);
											return (
												<IconComp
													className='w-5 h-5'
													style={{ color: formData.color }}
												/>
											);
										})()}
										<span>{formData.icon}</span>
									</button>
									{showIconPicker && (
										<div className='absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 max-h-48 overflow-y-auto'>
											<div className='grid grid-cols-6 gap-2'>
												{AVAILABLE_ICONS.map(({ name, icon: IconComp }) => (
													<button
														key={name}
														type='button'
														onClick={() => {
															setFormData({ ...formData, icon: name });
															setShowIconPicker(false);
														}}
														className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-600 ${
															formData.icon === name
																? 'bg-primary-100 dark:bg-primary-900/30'
																: ''
														}`}
														title={name}
													>
														<IconComp
															className='w-5 h-5'
															style={{ color: formData.color }}
														/>
													</button>
												))}
											</div>
										</div>
									)}
								</div>
							</div>

							{/* Description */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Description (optional)
								</label>
								<textarea
									value={formData.description}
									onChange={e =>
										setFormData({ ...formData, description: e.target.value })
									}
									placeholder='Brief description of this tag...'
									rows={2}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white'
								/>
							</div>

							{/* Preview */}
							<div>
								<label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'>
									Preview
								</label>
								<div className='flex items-center gap-2'>
									{(() => {
										const IconComp = getIconComponent(formData.icon);
										return (
											<span
												className='inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium'
												style={{
													backgroundColor: `${formData.color}20`,
													color: formData.color,
												}}
											>
												<IconComp className='w-3.5 h-3.5' />
												{formData.name || 'Tag Name'}
											</span>
										);
									})()}
								</div>
							</div>

							{/* Actions */}
							<div className='flex justify-end gap-3 pt-4'>
								<Button
									type='button'
									variant='secondary'
									onClick={() => {
										setShowCreateModal(false);
										setEditingTag(null);
										resetForm();
									}}
								>
									Cancel
								</Button>
								<Button
									type='submit'
									disabled={
										createMutation.isPending || updateMutation.isPending
									}
								>
									{(createMutation.isPending || updateMutation.isPending) && (
										<Loader2 className='w-4 h-4 mr-2 animate-spin' />
									)}
									{editingTag ? 'Update Tag' : 'Create Tag'}
								</Button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
};

export default Tags;
