import { useState } from "react";
import { Loader2, AlertTriangle, Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useCustomPluginInventory,
  useInstallCustomPlugin,
  useUninstallCustomPlugin,
  useBulkInstallCustomPlugins,
  useBulkUninstallCustomPlugins,
} from "../hooks";
import { CustomPlugin } from "../types";

export function InventoryDialog({
  plugin,
  onClose,
}: {
  plugin: CustomPlugin;
  onClose: () => void;
}) {
  const { data: inventory, isLoading: isInventoryLoading } =
    useCustomPluginInventory(plugin.id);

  const installMutation = useInstallCustomPlugin();
  const uninstallMutation = useUninstallCustomPlugin();
  const bulkInstallMutation = useBulkInstallCustomPlugins();
  const bulkUninstallMutation = useBulkUninstallCustomPlugins();

  const [selectedEnvIds, setSelectedEnvIds] = useState<number[]>([]);

  const handleToggleSelectAll = (checked: boolean) => {
    if (!inventory) return;
    if (checked) {
      setSelectedEnvIds(inventory.inventory.map((row) => row.environment.id));
    } else {
      setSelectedEnvIds([]);
    }
  };

  const handleToggleSelectRow = (envId: number, checked: boolean) => {
    if (checked) {
      setSelectedEnvIds((prev) => [...prev, envId]);
    } else {
      setSelectedEnvIds((prev) => prev.filter((id) => id !== envId));
    }
  };

  const allSelected =
    inventory &&
    inventory.inventory.length > 0 &&
    selectedEnvIds.length === inventory.inventory.length;

  // Selected environments that are NOT installed
  const installableSelected = inventory
    ? selectedEnvIds.filter((id) => {
        const row = inventory.inventory.find((r) => r.environment.id === id);
        return row && !row.installed;
      })
    : [];

  // Selected environments that ARE installed
  const uninstallableSelected = inventory
    ? selectedEnvIds.filter((id) => {
        const row = inventory.inventory.find((r) => r.environment.id === id);
        return row && row.installed;
      })
    : [];

  const handleBulkInstall = async () => {
    if (installableSelected.length === 0) return;
    await bulkInstallMutation.mutateAsync({
      envIds: installableSelected,
      pluginId: plugin.id,
    });
    setSelectedEnvIds([]);
  };

  const handleBulkUninstall = async () => {
    if (uninstallableSelected.length === 0) return;
    if (
      confirm(
        `Are you sure you want to uninstall ${plugin.name} from the ${uninstallableSelected.length} selected environments?`
      )
    ) {
      await bulkUninstallMutation.mutateAsync({
        envIds: uninstallableSelected,
        pluginId: plugin.id,
      });
      setSelectedEnvIds([]);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="pb-4 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                {plugin.name} Inventory
              </DialogTitle>
              <DialogDescription className="mt-1">
                Install, uninstall, and manage environments for this plugin.
              </DialogDescription>
            </div>
            {inventory && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 transition-all shadow-sm"
                  disabled={
                    installableSelected.length === 0 ||
                    bulkInstallMutation.isPending
                  }
                  onClick={handleBulkInstall}
                >
                  {bulkInstallMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                  Install Selected ({installableSelected.length})
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5 transition-all shadow-sm"
                  disabled={
                    uninstallableSelected.length === 0 ||
                    bulkUninstallMutation.isPending
                  }
                  onClick={handleBulkUninstall}
                >
                  {bulkUninstallMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Uninstall Selected ({uninstallableSelected.length})
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {isInventoryLoading ? (
          <div className="py-20 text-center text-muted-foreground flex-1 flex flex-col justify-center items-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm font-medium">Loading environment inventory...</p>
          </div>
        ) : inventory ? (
          <div className="flex-1 flex flex-col min-h-0 pt-4 space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                {inventory.summary.installed} installed
              </Badge>
              <Badge variant="secondary">
                {inventory.summary.detected} detected
              </Badge>
              {inventory.summary.outdated > 0 && (
                <Badge variant="warning">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                  {inventory.summary.outdated} outdated
                </Badge>
              )}
              <Badge variant="outline">
                {inventory.summary.not_scanned} not scanned
              </Badge>
            </div>
            
            <div className="border rounded-xl overflow-hidden flex-1 flex flex-col min-h-0 bg-card shadow-inner">
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 border-b sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="w-12 px-4 py-3 text-center">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleToggleSelectAll}
                          aria-label="Select all environments"
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Environment</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Version</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Latest</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wider">Last Scan</th>
                      <th className="w-24 px-4 py-3 text-right font-semibold text-xs text-muted-foreground uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {inventory.inventory.map((row) => {
                      const isSelected = selectedEnvIds.includes(row.environment.id);
                      
                      const isInstallingThis =
                        installMutation.isPending &&
                        installMutation.variables?.envId === row.environment.id;

                      const isUninstallingThis =
                        uninstallMutation.isPending &&
                        uninstallMutation.variables?.envId === row.environment.id;

                      const isMutatingThis = isInstallingThis || isUninstallingThis;

                      return (
                        <tr
                          key={row.environment.id}
                          className={`hover:bg-muted/20 transition-colors ${
                            isSelected ? "bg-muted/10" : ""
                          }`}
                        >
                          <td className="px-4 py-3 text-center">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                handleToggleSelectRow(
                                  row.environment.id,
                                  !!checked
                                )
                              }
                              aria-label={`Select ${row.environment.project.name} ${row.environment.type}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">
                              {row.environment.project.name}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              <span className="capitalize">{row.environment.type}</span> · {row.environment.server.name}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                row.outdated
                                  ? "warning"
                                  : row.installed
                                    ? "success"
                                    : row.detected
                                      ? "info"
                                      : "outline"
                              }
                              className="capitalize font-semibold text-[10px] px-1.5 py-0.5"
                            >
                              {row.outdated ? "outdated" : row.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {row.installed_version ?? row.scanned_version ?? "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {row.latest_version ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {row.last_scanned_at
                              ? new Date(row.last_scanned_at).toLocaleString()
                              : "Never"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isMutatingThis ? (
                              <div className="inline-flex justify-end pr-3">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            ) : row.installed ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive gap-1 px-2.5"
                                onClick={async () => {
                                  if (
                                    confirm(
                                      `Uninstall ${plugin.name} from ${row.environment.project.name} (${row.environment.type})?`
                                    )
                                  ) {
                                    await uninstallMutation.mutateAsync({
                                      envId: row.environment.id,
                                      pluginId: plugin.id,
                                    });
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Uninstall
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:text-emerald-700 gap-1 px-2.5"
                                onClick={() =>
                                  installMutation.mutate({
                                    envId: row.environment.id,
                                    pluginId: plugin.id,
                                  })
                                }
                              >
                                <Play className="h-3 w-3 fill-current" />
                                Install
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
