import { Loader2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from '@/components/ui/dialog';
import { useCustomPluginInventory } from '../hooks';
import { CustomPlugin } from '../types';

export function InventoryDialog({
	plugin,
	onClose,
}: {
	plugin: CustomPlugin;
	onClose: () => void;
}) {
	const { data: inventory, isLoading: isInventoryLoading } = useCustomPluginInventory(plugin.id);

	return (
		<Dialog open onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>{plugin.name} Inventory</DialogTitle>
					<DialogDescription>
						Installed and detected environments from the latest plugin scans.
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
	);
}
