import { api } from "@/lib/api-client";
import { SshKeyStatus } from "./types";

export const accountApi = {
  getSshKeyStatus: () => api.get<SshKeyStatus>("/settings/ssh-key"),
  setSshKey: (key: string) => api.put<void>("/settings/ssh-key", { key }),
  deleteSshKey: () => api.delete<void>("/settings/ssh-key"),
  changePassword: (data: Record<string, string>) =>
    api.put<void>("/auth/change-password", data),
};
