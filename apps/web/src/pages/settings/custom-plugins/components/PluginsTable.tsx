import {
  Package,
  Badge,
  ExternalLink,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge as UiBadge } from "@/components/ui/badge";
import { CustomPlugin } from "../types";
import { useCheckPluginVersions, useUpdateInstalledPlugins } from "../hooks";

export function PluginsTable({
  plugins,
  onViewInventory,
  onEdit,
  onDelete,
}: {
  plugins: CustomPlugin[];
  onViewInventory: (plugin: CustomPlugin) => void;
  onEdit: (plugin: CustomPlugin) => void;
  onDelete: (plugin: CustomPlugin) => void;
}) {
  const checkVersionsMutation = useCheckPluginVersions();
  const updateInstalledMutation = useUpdateInstalledPlugins();

  return (
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
              <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-muted rounded-lg">
                      <Package className="h-4 w-4 text-primary/70" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{p.name}</span>
                        <UiBadge
                          variant="outline"
                          className="text-[10px] h-4.5 px-1.5 uppercase font-bold text-muted-foreground"
                        >
                          {p.type}
                        </UiBadge>
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
                      {p.repo_url.replace(/^git@github\.com:/, "")}
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
                  {p.inventory_summary && p.inventory_summary.outdated > 0 && (
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
                      onClick={() => onViewInventory(p)}
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
                      onClick={() => onEdit(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/5 hover:text-destructive"
                      onClick={() => onDelete(p)}
                      disabled={p._count.environment_plugins > 0}
                      title={
                        p._count.environment_plugins > 0
                          ? "Uninstall from all environments first"
                          : "Delete"
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
  );
}
