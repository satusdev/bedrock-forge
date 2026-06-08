import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { automationApi } from "./api";

export function useAutomationSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: automationApi.getSettings,
  });
}

export function useUpdateSettingMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      automationApi.updateSetting(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast({ title: "Setting updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });
}
