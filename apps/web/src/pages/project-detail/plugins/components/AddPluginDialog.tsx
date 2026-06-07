import { useState, useEffect, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Plus } from 'lucide-react';
import { pluginsApi } from '../api';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';

export function AddPluginDialog({
	envId,
	open,
	onClose,
	isBedrock,
	onJobQueued,
}: {
	envId: number;
	open: boolean;
	onClose: () => void;
	isBedrock: boolean;
	onJobQueued?: (data: { jobExecutionId?: number; bullJobId?: string }) => void;
}) {
	const qc = useQueryClient();
	const [slug, setSlug] = useState('');
	const [version, setVersion] = useState('');
	const [skipSafetyBackup, setSkipSafetyBackup] = useState(true);
	const [workflow, setWorkflow] = useState<'composer' | 'manual'>('composer');

	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<any[]>([]);
	const [isSearching, setIsSearching] = useState(false);

	useEffect(() => {
		if (!searchQuery.trim()) {
			setSearchResults([]);
			return;
		}
		const delay = setTimeout(() => {
			setIsSearching(true);
			pluginsApi.searchWpOrg(searchQuery)
				.then(res => {
					setSearchResults(res || []);
				})
				.catch(() => {
					setSearchResults([]);
				})
				.finally(() => {
					setIsSearching(false);
				});
		}, 400);
		return () => clearTimeout(delay);
	}, [searchQuery]);

	const mutation = useMutation({
		mutationFn: () =>
			pluginsApi.installPlugin(envId, {
				slug: slug.trim(),
				version: version.trim() || undefined,
				workflow: isBedrock ? workflow : 'manual',
				skipSafetyBackup,
			}),
		onSuccess: (data) => {
			toast({
				title: 'Plugin install queued',
				description: isBedrock && workflow === 'composer'
					? `wpackagist-plugin/${slug} will be added via composer.`
					: `${slug} will be installed via WP-CLI.`,
			});
			qc.invalidateQueries({ queryKey: ['plugin-scans', envId] });
			if (onJobQueued) {
				onJobQueued(data);
			}
			setSlug('');
			setVersion('');
			setSearchQuery('');
			setWorkflow('composer');
			setSkipSafetyBackup(true);
			onClose();
		},
		onError: () =>
			toast({ title: 'Failed to queue install', variant: 'destructive' }),
	});

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!slug.trim()) return;
		mutation.mutate();
	}

	return (
		<Dialog open={open} onOpenChange={v => !v && onClose()}>
			<DialogContent className='sm:max-w-lg max-h-[90vh] flex flex-col'>
				<DialogHeader>
					<DialogTitle>Add New Plugin</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className='space-y-4 py-2 overflow-y-auto flex-1 pr-1'>
					{/* Search field */}
					<div className='space-y-1.5'>
						<label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
							Search WordPress.org
						</label>
						<div className='relative'>
							<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
							<Input
								placeholder='Search plugins (e.g. contact form, seo)...'
								className='pl-9'
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
								disabled={mutation.isPending}
							/>
						</div>
						{isSearching && (
							<div className='flex items-center gap-2 text-xs text-muted-foreground pt-1.5 justify-center'>
								<Loader2 className='h-3 w-3 animate-spin' />
								Searching WordPress.org...
							</div>
						)}
						{searchResults.length > 0 && (
							<div className='border rounded-md divide-y max-h-48 overflow-y-auto bg-muted/10 mt-1.5'>
								{searchResults.map(p => (
									<div
										key={p.slug}
										className='p-2.5 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors text-xs'
									>
										<div className='space-y-0.5'>
											<span className='font-semibold text-foreground'>{p.name}</span>
											<span className='text-[10px] bg-muted px-1 py-0.5 rounded text-muted-foreground ml-1.5 font-mono'>{p.slug}</span>
											<p className='text-muted-foreground line-clamp-1 text-[11px]'>{p.description}</p>
											<p className='text-[10px] text-muted-foreground/80'>By {p.author}</p>
										</div>
										<Button
											type='button'
											size='sm'
											variant='outline'
											className='h-7 text-xs px-2 shrink-0'
											onClick={() => {
												setSlug(p.slug);
												setSearchQuery('');
												setSearchResults([]);
											}}
										>
											Select
										</Button>
									</div>
								))}
							</div>
						)}
					</div>

					<div className='border-t pt-3 space-y-4'>
						<div className='space-y-1.5'>
							<label className='text-sm font-medium'>Plugin Slug</label>
							<Input
								placeholder='e.g. woocommerce'
								value={slug}
								onChange={e => setSlug(e.target.value)}
								disabled={mutation.isPending}
								required
							/>
						</div>

						{isBedrock && (
							<div className='space-y-1.5'>
								<label className='text-sm font-medium'>Installation Workflow</label>
								<Select
									value={workflow}
									onValueChange={v => setWorkflow(v as 'composer' | 'manual')}
									disabled={mutation.isPending}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='composer'>Composer-managed (composer.json)</SelectItem>
										<SelectItem value='manual'>Manual installation (WP-CLI direct)</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}

						<div className='space-y-1.5'>
							<label className='text-sm font-medium'>
								Version constraint{' '}
								<span className='text-muted-foreground font-normal'>
									(optional)
								</span>
							</label>
							<Input
								placeholder={workflow === 'composer' ? 'e.g. ^8.0 or 8.1.2' : 'e.g. 8.1.2'}
								value={version}
								onChange={e => setVersion(e.target.value)}
								disabled={mutation.isPending}
							/>
						</div>

						<div className='flex items-center space-x-2 pt-2'>
							<Checkbox
								id='add-skip-backup'
								checked={skipSafetyBackup}
								onCheckedChange={(checked) => setSkipSafetyBackup(checked as boolean)}
								disabled={mutation.isPending}
							/>
							<label
								htmlFor='add-skip-backup'
								className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
							>
								Skip pre-flight safety backup
							</label>
						</div>
					</div>

					<DialogFooter className='border-t pt-3'>
						<Button
							type='button'
							variant='outline'
							onClick={onClose}
							disabled={mutation.isPending}
						>
							Cancel
						</Button>
						<Button type='submit' disabled={!slug.trim() || mutation.isPending}>
							{mutation.isPending ? (
								<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
							) : (
								<Plus className='h-4 w-4 mr-1.5' />
							)}
							Add Plugin
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
