import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { accountApi } from "./api";

export function useSshKeyStatus() {
  return useQuery({
    queryKey: ["ssh-key-status"],
    queryFn: accountApi.getSshKeyStatus,
  });
}

export function useSetSshKeyMutation(onSuccessCallback?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountApi.setSshKey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ssh-key-status"] });
      if (onSuccessCallback) onSuccessCallback();
      toast({ title: "Global SSH key saved" });
    },
    onError: () =>
      toast({ title: "Failed to save SSH key", variant: "destructive" }),
  });
}

export function useDeleteSshKeyMutation(onSuccessCallback?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountApi.deleteSshKey,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ssh-key-status"] });
      if (onSuccessCallback) onSuccessCallback();
      toast({ title: "Global SSH key removed" });
    },
    onError: () =>
      toast({ title: "Failed to remove SSH key", variant: "destructive" }),
  });
}

export function useChangePasswordMutation(onSuccessCallback?: () => void) {
  return useMutation({
    mutationFn: accountApi.changePassword,
    onSuccess: () => {
      if (onSuccessCallback) onSuccessCallback();
      toast({ title: "Password changed successfully" });
    },
    onError: (e: any) =>
      toast({
        title: "Failed to change password",
        description: e?.message,
        variant: "destructive",
      }),
  });
}
