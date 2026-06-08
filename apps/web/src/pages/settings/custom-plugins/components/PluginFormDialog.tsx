import { useId, useState, FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from '@/components/ui/dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { PluginFormData } from '../types';

export function PluginFormDialog({
	initial,
	onClose,
	onSave,
	isPending,
}: {
	initial: PluginFormData;
	onClose: () => void;
	onSave: (data: PluginFormData) => void;
	isPending: boolean;
}) {
	const [form, setForm] = useState<PluginFormData>(initial);
	const fieldIdPrefix = useId();
	const isEdit = !!initial.name;
	const nameId = `${fieldIdPrefix}-custom-plugin-name`;
	const slugId = `${fieldIdPrefix}-custom-plugin-slug`;
	const typeId = `${fieldIdPrefix}-custom-plugin-type`;
	const repoUrlId = `${fieldIdPrefix}-custom-plugin-repo-url`;
	const repoPathId = `${fieldIdPrefix}-custom-plugin-repo-path`;
	const descriptionId = `${fieldIdPrefix}-custom-plugin-description`;

	function set(field: keyof PluginFormData, value: string) {
		setForm((prev) => ({ ...prev, [field]: value }));
	}

	// Auto-slug from name when creating
	function handleNameChange(value: string) {
		set('name', value);
		if (!isEdit) {
			set(
				'slug',
				value
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, ''),
			);
		}
	}

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!form.name.trim() || !form.slug.trim() || !form.repo_url.trim()) return;
		onSave(form);
	}

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Edit Custom Plugin' : 'Register Custom Plugin'}
					</DialogTitle>
					<DialogDescription>
						Provide the repository details for your custom Bedrock-compatible
						plugin.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-4 py-2">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5 col-span-2">
							<label htmlFor={nameId} className="text-sm font-bold">
								Display Name
							</label>
							<Input
								id={nameId}
								value={form.name}
								onChange={(e) => handleNameChange(e.target.value)}
								placeholder="WP Secure Guard"
								disabled={isPending}
								className="bg-muted/20"
								autoFocus
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor={slugId} className="text-sm font-bold">
								Slug
							</label>
							<Input
								id={slugId}
								value={form.slug}
								onChange={(e) => set('slug', e.target.value.toLowerCase())}
								placeholder="wp-secure-guard"
								disabled={isPending}
								className="font-mono text-xs bg-muted/20"
							/>
						</div>
						<div className="space-y-1.5">
							<label htmlFor={typeId} className="text-sm font-bold">
								Type
							</label>
							<Select value={form.type} onValueChange={(v) => set('type', v)}>
								<SelectTrigger id={typeId} className="bg-muted/20">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="plugin">Plugin</SelectItem>
									<SelectItem value="theme">Theme</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="space-y-1.5">
						<label htmlFor={repoUrlId} className="text-sm font-bold">
							Repository URL
						</label>
						<Input
							id={repoUrlId}
							value={form.repo_url}
							onChange={(e) => set('repo_url', e.target.value.trim())}
							placeholder="git@github.com:satusdev/wp-secure-guard.git"
							disabled={isPending}
							className="font-mono text-xs bg-muted/20"
						/>
						<p className="text-[10px] text-muted-foreground italic">
							Use SSH (<code>git@github.com:org/repo.git</code>) for private
							repos.
						</p>
					</div>
					<div className="space-y-1.5">
						<label htmlFor={repoPathId} className="text-sm font-bold">
							Repository Path{' '}
							<span className="text-muted-foreground font-normal">
								(optional)
							</span>
						</label>
						<Input
							id={repoPathId}
							value={form.repo_path}
							onChange={(e) => set('repo_path', e.target.value)}
							placeholder="."
							disabled={isPending}
							className="font-mono text-xs bg-muted/20"
						/>
						<p className="text-[10px] text-muted-foreground italic">
							Subdirectory path if this is a monorepo.
						</p>
					</div>
					<div className="space-y-1.5">
						<label htmlFor={descriptionId} className="text-sm font-bold">
							Description
						</label>
						<Input
							id={descriptionId}
							value={form.description}
							onChange={(e) => set('description', e.target.value)}
							placeholder="A short description for the plugin catalog…"
							disabled={isPending}
							className="bg-muted/20"
						/>
					</div>
					<DialogFooter className="pt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={onClose}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={
								!form.name.trim() ||
								!form.slug.trim() ||
								!form.repo_url.trim() ||
								isPending
							}
							className="bg-primary shadow-lg shadow-primary/20"
						>
							{isPending ? (
								<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
							) : null}
							{isEdit ? 'Update Plugin' : 'Register Plugin'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
