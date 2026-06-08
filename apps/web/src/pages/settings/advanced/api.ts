import { api } from "@/lib/api-client";

export const advancedApi = {
  getSettings: () => api.get<Record<string, string>>("/settings"),
  updateSetting: (key: string, value: string) =>
    api.put<void>(`/settings/${key}`, { value }),
  deleteSetting: (key: string) => api.delete<void>(`/settings/${key}`),
};
