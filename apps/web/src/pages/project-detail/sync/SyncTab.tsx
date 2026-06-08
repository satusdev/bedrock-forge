import { RefreshCw, Database, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Environment } from "./types";
import { useSyncHistoryQuery, useCancelSyncMutation } from "./hooks";
import { ClonePanel } from "./components/ClonePanel";
import { PushPanel } from "./components/PushPanel";
import { SyncHistoryRow } from "./components/SyncHistoryRow";

export function SyncTab({
  projectId,
  environments,
}: {
  projectId: number;
  environments: Environment[];
}) {
  const envIds = environments.map((e) => e.id).join(",");

  const { data: historyData } = useSyncHistoryQuery(
    projectId,
    envIds,
    environments.length > 0,
  );

  const cancelHistoryMutation = useCancelSyncMutation(projectId);

  if (environments.length < 2) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Need at least 2 environments to sync</p>
        <p className="text-sm mt-1">Add environments in the Environments tab</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="font-semibold mb-1">Sync Environments</h3>
        <p className="text-sm text-muted-foreground">
          Clone copies data from source to target. Push lets you select scope
          (database, files, or both) for more granular control.
        </p>
      </div>

      <Tabs defaultValue="clone">
        <TabsList className="w-full">
          <TabsTrigger value="clone" className="flex-1">
            <Database className="h-3.5 w-3.5 mr-1.5" />
            Clone DB
          </TabsTrigger>
          <TabsTrigger value="push" className="flex-1">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Push
          </TabsTrigger>
        </TabsList>
        <TabsContent value="clone" className="pt-4">
          <ClonePanel projectId={projectId} environments={environments} />
        </TabsContent>
        <TabsContent value="push" className="pt-4">
          <PushPanel projectId={projectId} environments={environments} />
        </TabsContent>
      </Tabs>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Sync History</h4>

        {!historyData || historyData.data.length === 0 ? (
          <div className="border rounded-lg text-center py-8 text-muted-foreground text-sm">
            No sync jobs yet for this project.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-2 py-2.5 text-xs font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="text-left px-2 py-2.5 text-xs font-medium text-muted-foreground">
                    Started
                  </th>
                  <th className="text-left px-2 py-2.5 text-xs font-medium text-muted-foreground">
                    Duration
                  </th>
                  <th className="text-left px-2 py-2.5 text-xs font-medium text-muted-foreground">
                    Details
                  </th>
                  <th className="py-2.5 pr-4 pl-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {historyData.data.map((row) => (
                  <SyncHistoryRow
                    key={row.id}
                    row={row}
                    onCancel={cancelHistoryMutation.mutate}
                    isCancelling={cancelHistoryMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
export default SyncTab;
