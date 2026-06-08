import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customPluginsApi } from "./api";
import { toast } from "@/hooks/use-toast";
import { CustomPlugin, PluginFormData } from "./types";

export function useCustomPlugins() {
  return useQuery<CustomPlugin[]>({
    queryKey: ["custom-plugins"],
    queryFn: customPluginsApi.getPlugins,
  });
}

export function useCustomPluginInventory(id?: number) {
  return useQuery({
    queryKey: ["custom-plugin-inventory", id],
    enabled: !!id,
    queryFn: () => customPluginsApi.getInventory(id!),
  });
}

export function useScanAllPlugins() {
  return useMutation({
    mutationFn: customPluginsApi.scanAll,
    onSuccess: (data) => {
      toast({
        title: "Bulk scan queued",
        description: `${data.count} environment scan${data.count === 1 ? "" : "s"} queued.`,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Bulk scan failed",
        description: err?.message,
        variant: "destructive",
      }),
  });
}

export function useCheckPluginVersions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customPluginsApi.checkVersions,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["custom-plugins"] });
      queryClient.invalidateQueries({ queryKey: ["custom-plugin-inventory"] });
      toast({
        title: "Version check complete",
        description: data.latest_version
          ? `Latest version: ${data.latest_version}`
          : "No GitHub release tag found.",
      });
    },
    onError: (err: any) =>
      toast({
        title: "Version check failed",
        description: err?.message,
        variant: "destructive",
      }),
  });
}

export function useUpdateInstalledPlugins() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customPluginsApi.updateInstalled,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["custom-plugins"] });
      queryClient.invalidateQueries({ queryKey: ["custom-plugin-inventory"] });
      toast({
        title: "Updates queued",
        description: `${data.count} environment update${data.count === 1 ? "" : "s"} queued.`,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Update failed",
        description: err?.message,
        variant: "destructive",
      }),
  });
}

export function useCreatePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customPluginsApi.createPlugin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-plugins"] });
      toast({ title: "Plugin registered" });
    },
    onError: (err: any) =>
      toast({
        title: "Failed to register plugin",
        description: err?.message,
        variant: "destructive",
      }),
  });
}

export function useUpdatePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PluginFormData }) =>
      customPluginsApi.updatePlugin(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-plugins"] });
      toast({ title: "Plugin updated" });
    },
    onError: (err: any) =>
      toast({
        title: "Update failed",
        description: err?.message,
        variant: "destructive",
      }),
  });
}

export function useDeletePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customPluginsApi.deletePlugin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-plugins"] });
      toast({ title: "Plugin removed from catalog" });
    },
    onError: (err: any) =>
      toast({
        title: "Delete failed",
        description: err?.message,
        variant: "destructive",
      }),
  });
}
