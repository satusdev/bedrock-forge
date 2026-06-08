import { api } from "@/lib/api-client";
import { PluginInventoryResponse } from "./types";

export const pluginsApi = {
  getPluginInventory: () =>
    api.get<PluginInventoryResponse>("/plugin-scans/inventory"),
};
