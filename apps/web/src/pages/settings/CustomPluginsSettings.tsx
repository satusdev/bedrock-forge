import { useId, useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Plus,
	Pencil,
	Trash2,
	Loader2,
	Github,
	Package,
	ExternalLink,
	RefreshCw,
	RotateCcw,
	ListChecks,
	AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from '@/components/ui/dialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/crud/StateViews';

export interface CustomPlugin {
	id: number;
	name: string;
	slug: string;
	description: string | null;
	repo_url: string;
	repo_path: string;
	type: string;
	created_at: string;
	_count: { environment_plugins: number };
	inventory_summary?: {
		environments: number;
		installed: number;
		detected: number;
		outdated: number;
		not_scanned: number;
	};
}

interface CustomPluginInventory {
	plugin: CustomPlugin;
	summary: {
		environments: number;
		installed: number;
		detected: number;
		outdated: number;
		not_scanned: number;
	};
	inventory: Array<{
		environment: {
			id: number;
			type: string;
			url: string;
			project: {
				id: number;
				name: string;
				client: { id: number; name: string };
			};
			server: { id: number; name: string; ip_address: string };
		};
		status: 'installed' | 'detected' | 'absent';
		installed: boolean;
		detected: boolean;
		scanned_version: string | null;
		installed_version: string | null;
		latest_version: string | null;
		outdated: boolean;
		last_scanned_at: string | null;
		version_checked_at: string | null;
	}>;
}

interface PluginFormData {
	name: string;
	slug: string;
	description: string;
	repo_url: string;
	repo_path: string;
	type: string;
}

const EMPTY_FORM: PluginFormData = {
	name: '',
	slug: '',
	description: '',
	repo_url: '',
	repo_path: '.',
	type: 'plugin',
};

function PluginFormDialog({
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

export function CustomPluginsSettings() {
	const qc = useQueryClient();
	const [dialogForm, setDialogForm] = useState<PluginFormData | null>(null);
	const [editTarget, setEditTarget] = useState<CustomPlugin | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<CustomPlugin | null>(null);
	const [inventoryTarget, setInventoryTarget] = useState<CustomPlugin | null>(
		null,
	);

	const { data: plugins = [], isLoading } = useQuery<CustomPlugin[]>({
		queryKey: ['custom-plugins'],
		queryFn: () => api.get<CustomPlugin[]>('/custom-plugins'),
	});

	const { data: inventory, isLoading: isInventoryLoading } =
		useQuery<CustomPluginInventory>({
			queryKey: ['custom-plugin-inventory', inventoryTarget?.id],
			enabled: !!inventoryTarget,
			queryFn: () =>
				api.get<CustomPluginInventory>(
					`/custom-plugins/${inventoryTarget?.id}/inventory`,
				),
		});

	const scanAllMutation = useMutation({
		mutationFn: () =>
			api.post<{ count: number; jobs: unknown[] }>(
				'/plugin-scans/bulk/scan',
				{},
			),
		onSuccess: (data) => {
			toast({
				title: 'Bulk scan queued',
				description: `${data.count} environment scan${data.count === 1 ? '' : 's'} queued.`,
			});
		},
		onError: (err: any) =>
			toast({
				title: 'Bulk scan failed',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const checkVersionsMutation = useMutation({
		mutationFn: (id: number) =>
			api.post<{ latest_version: string | null; updated: number }>(
				`/custom-plugins/${id}/check-versions`,
				{},
			),
		onSuccess: (data) => {
			qc.invalidateQueries({ queryKey: ['custom-plugins'] });
			qc.invalidateQueries({ queryKey: ['custom-plugin-inventory'] });
			toast({
				title: 'Version check complete',
				description: data.latest_version
					? `Latest version: ${data.latest_version}`
					: 'No GitHub release tag found.',
			});
		},
		onError: (err: any) =>
			toast({
				title: 'Version check failed',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const updateInstalledMutation = useMutation({
		mutationFn: (id: number) =>
			api.post<{ count: number; jobs: unknown[] }>(
				`/custom-plugins/${id}/update-installed`,
				{},
			),
		onSuccess: (data) => {
			qc.invalidateQueries({ queryKey: ['custom-plugins'] });
			qc.invalidateQueries({ queryKey: ['custom-plugin-inventory'] });
			toast({
				title: 'Updates queued',
				description: `${data.count} environment update${data.count === 1 ? '' : 's'} queued.`,
			});
		},
		onError: (err: any) =>
			toast({
				title: 'Update failed',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const createMutation = useMutation({
		mutationFn: (data: PluginFormData) =>
			api.post<CustomPlugin>('/custom-plugins', data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['custom-plugins'] });
			setDialogForm(null);
			toast({ title: 'Plugin registered' });
		},
		onError: (err: any) =>
			toast({
				title: 'Failed to register plugin',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: PluginFormData }) =>
			api.put<CustomPlugin>(`/custom-plugins/${id}`, data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['custom-plugins'] });
			setEditTarget(null);
			toast({ title: 'Plugin updated' });
		},
		onError: (err: any) =>
			toast({
				title: 'Update failed',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/custom-plugins/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['custom-plugins'] });
			setDeleteTarget(null);
			toast({ title: 'Plugin removed from catalog' });
		},
		onError: (err: any) =>
			toast({
				title: 'Delete failed',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<h2 className="text-xl font-bold flex items-center gap-2">
						<Github className="h-5 w-5 text-indigo-500" />
						Plugin Catalog
					</h2>
					<p className="text-sm text-muted-foreground">
						Manage GitHub-hosted plugins available for installation across your
						environments.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() => scanAllMutation.mutate()}
						disabled={scanAllMutation.isPending}
					>
						{scanAllMutation.isPending ? (
							<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						) : (
							<RefreshCw className="h-4 w-4 mr-2" />
						)}
						Scan All
					</Button>
					<Button
						size="sm"
						onClick={() => setDialogForm(EMPTY_FORM)}
						className="shadow-md"
					>
						<Plus className="h-4 w-4 mr-2" />
						Register Plugin
					</Button>
				</div>
			</div>

			{isLoading ? (
				<div className="space-y-3">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-16 bg-muted/40 animate-pulse rounded-xl"
						/>
					))}
				</div>
			) : plugins.length === 0 ? (
				<EmptyState
					icon={Package}
					title="Empty Catalog"
					description="You haven't registered any custom plugins yet. Register your GitHub repos to start deploying them."
					action={
						<Button variant="outline" onClick={() => setDialogForm(EMPTY_FORM)}>
							Add First Plugin
						</Button>
					}
				/>
			) : (
				<div className="border rounded-xl overflow-hidden bg-card shadow-sm">
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="bg-muted/50 border-b">
									<th className="text-left px-5 py-4 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">
										Asset Details
									</th>
									<th className="text-left px-5 py-4 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">
										Repository
									</th>
									<th className="text-left px-5 py-4 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">
										Internal Path
									</th>
									<th className="text-center px-5 py-4 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">
										Usage
									</th>
									<th className="w-20 px-5 py-4" />
								</tr>
							</thead>
							<tbody className="divide-y">
								{plugins.map((p) => (
									<tr
										key={p.id}
										className="hover:bg-muted/30 transition-colors"
									>
										<td className="px-5 py-4">
											<div className="flex items-center gap-2.5">
												<div className="p-1.5 bg-muted rounded-lg">
													<Package className="h-4 w-4 text-primary/70" />
												</div>
												<div>
													<div className="flex items-center gap-2">
														<span className="font-bold">{p.name}</span>
														<Badge
															variant="outline"
															className="text-[10px] h-4.5 px-1.5 uppercase font-bold text-muted-foreground"
														>
															{p.type}
														</Badge>
													</div>
													<p className="text-xs text-muted-foreground mt-0.5 font-mono opacity-80">
														{p.slug}
													</p>
												</div>
											</div>
										</td>
										<td className="px-5 py-4">
											<div className="flex items-center gap-2 group cursor-pointer">
												<span className="font-mono text-xs text-muted-foreground max-w-[200px] truncate">
													{p.repo_url.replace(/^git@github\.com:/, '')}
												</span>
												<ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
											</div>
										</td>
										<td className="px-5 py-4">
											<code className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
												{p.repo_path}
											</code>
										</td>
										<td className="px-5 py-4 text-center">
											<div className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-900/30">
												<span className="text-xs font-bold">
													{p.inventory_summary?.installed ??
														p._count.environment_plugins}
												</span>
												<span className="text-[10px] font-medium">Sites</span>
											</div>
											{p.inventory_summary &&
												p.inventory_summary.outdated > 0 && (
													<div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
														{p.inventory_summary.outdated} outdated
													</div>
												)}
										</td>
										<td className="px-5 py-4">
											<div className="flex items-center justify-end gap-1">
												<Button
													size="icon"
													variant="ghost"
													className="h-8 w-8 hover:bg-muted"
													onClick={() => setInventoryTarget(p)}
													title="View inventory"
												>
													<ListChecks className="h-3.5 w-3.5" />
												</Button>
												<Button
													size="icon"
													variant="ghost"
													className="h-8 w-8 hover:bg-muted"
													onClick={() => checkVersionsMutation.mutate(p.id)}
													disabled={checkVersionsMutation.isPending}
													title="Check versions"
												>
													<RefreshCw className="h-3.5 w-3.5" />
												</Button>
												<Button
													size="icon"
													variant="ghost"
													className="h-8 w-8 hover:bg-muted"
													onClick={() => updateInstalledMutation.mutate(p.id)}
													disabled={
														updateInstalledMutation.isPending ||
														(p.inventory_summary?.installed ??
															p._count.environment_plugins) === 0
													}
													title="Update installed sites"
												>
													<RotateCcw className="h-3.5 w-3.5" />
												</Button>
												<Button
													size="icon"
													variant="ghost"
													className="h-8 w-8 hover:bg-muted"
													onClick={() => setEditTarget(p)}
												>
													<Pencil className="h-3.5 w-3.5" />
												</Button>
												<Button
													size="icon"
													variant="ghost"
													className="h-8 w-8 text-destructive hover:bg-destructive/5 hover:text-destructive"
													onClick={() => setDeleteTarget(p)}
													disabled={p._count.environment_plugins > 0}
													title={
														p._count.environment_plugins > 0
															? 'Uninstall from all environments first'
															: 'Delete'
													}
												>
													<Trash2 className="h-3.5 w-3.5" />
												</Button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Create dialog */}
			{dialogForm && (
				<PluginFormDialog
					initial={dialogForm}
					onClose={() => setDialogForm(null)}
					onSave={(data) => createMutation.mutate(data)}
					isPending={createMutation.isPending}
				/>
			)}

			{/* Edit dialog */}
			{editTarget && (
				<PluginFormDialog
					initial={{
						name: editTarget.name,
						slug: editTarget.slug,
						description: editTarget.description ?? '',
						repo_url: editTarget.repo_url,
						repo_path: editTarget.repo_path,
						type: editTarget.type,
					}}
					onClose={() => setEditTarget(null)}
					onSave={(data) => updateMutation.mutate({ id: editTarget.id, data })}
					isPending={updateMutation.isPending}
				/>
			)}

			{/* Delete confirmation */}
			{deleteTarget && (
				<AlertDialog
					open
					onOpenChange={(v) => !v && setDeleteTarget(null)}
					title={`Remove ${deleteTarget.name}?`}
					description="This removes the plugin from the catalog. It will not uninstall it from environments where it is already deployed."
					confirmLabel="Remove Permanently"
					confirmVariant="destructive"
					onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
					isPending={deleteMutation.isPending}
				/>
			)}

			{inventoryTarget && (
				<Dialog open onOpenChange={(v) => !v && setInventoryTarget(null)}>
					<DialogContent className="sm:max-w-4xl">
						<DialogHeader>
							<DialogTitle>{inventoryTarget.name} Inventory</DialogTitle>
							<DialogDescription>
								Installed and detected environments from the latest plugin
								scans.
							</DialogDescription>
						</DialogHeader>
						{isInventoryLoading ? (
							<div className="py-10 text-center text-muted-foreground">
								<Loader2 className="h-6 w-6 mx-auto animate-spin" />
							</div>
						) : inventory ? (
							<div className="space-y-4">
								<div className="flex flex-wrap gap-2 text-xs">
									<Badge variant="secondary">
										{inventory.summary.installed} installed
									</Badge>
									<Badge variant="secondary">
										{inventory.summary.detected} detected
									</Badge>
									{inventory.summary.outdated > 0 && (
										<Badge variant="warning">
											<AlertTriangle className="h-3 w-3 mr-1" />
											{inventory.summary.outdated} outdated
										</Badge>
									)}
									<Badge variant="outline">
										{inventory.summary.not_scanned} not scanned
									</Badge>
								</div>
								<div className="border rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
									<table className="w-full text-sm">
										<thead className="bg-muted/50 sticky top-0">
											<tr>
												<th className="text-left px-4 py-3">Environment</th>
												<th className="text-left px-4 py-3">Status</th>
												<th className="text-left px-4 py-3">Version</th>
												<th className="text-left px-4 py-3">Latest</th>
												<th className="text-left px-4 py-3">Last Scan</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{inventory.inventory.map((row) => (
												<tr key={row.environment.id}>
													<td className="px-4 py-3">
														<div className="font-medium">
															{row.environment.project.name}
														</div>
														<div className="text-xs text-muted-foreground">
															{row.environment.type} ·{' '}
															{row.environment.server.name}
														</div>
													</td>
													<td className="px-4 py-3">
														<Badge
															variant={
																row.outdated
																	? 'warning'
																	: row.installed
																		? 'success'
																		: row.detected
																			? 'info'
																			: 'outline'
															}
															className="capitalize"
														>
															{row.outdated ? 'outdated' : row.status}
														</Badge>
													</td>
													<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
														{row.installed_version ??
															row.scanned_version ??
															'—'}
													</td>
													<td className="px-4 py-3 font-mono text-xs text-muted-foreground">
														{row.latest_version ?? '—'}
													</td>
													<td className="px-4 py-3 text-xs text-muted-foreground">
														{row.last_scanned_at
															? new Date(row.last_scanned_at).toLocaleString()
															: 'Never'}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						) : null}
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
