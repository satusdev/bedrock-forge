import { useQuery } from "@tanstack/react-query";
import { pluginsApi } from "./api";

export function usePluginInventory() {
  return useQuery({
    queryKey: ["plugin-scans", "inventory"],
    queryFn: pluginsApi.getPluginInventory,
  });
}
