import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { syncApi } from "./api";
import { SyncHistoryPage } from "./types";

export function useSyncHistoryQuery(
  projectId: number,
  envIds: string,
  enabled: boolean,
) {
  return useQuery<SyncHistoryPage>({
    queryKey: ["sync-history", projectId],
    queryFn: () => syncApi.getSyncHistory(envIds),
    enabled: enabled && !!envIds,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useCancelSyncMutation(projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => syncApi.cancelSyncExecution(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-history", projectId] });
      toast({ title: "Job stopped" });
    },
    onError: () => {
      toast({ title: "Could not stop job", variant: "destructive" });
    },
  });
}
