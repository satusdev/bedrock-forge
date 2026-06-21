import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Lock, Settings2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import type { SecuritySettings } from "../types";

export function ForgeSecurityTab() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<SecuritySettings>({
    queryKey: ["security", "settings"],
    queryFn: () => api.get("/security/settings"),
  });

  const [ipInput, setIpInput] = useState("");
  const [cidrError, setCidrError] = useState("");
  const [localIpList, setLocalIpList] = useState<string[] | null>(null);
  const [localThreshold, setLocalThreshold] = useState<string | null>(null);

  const ipList = localIpList ?? settings?.ip_allowlist ?? [];
  const threshold = localThreshold ?? settings?.notify_threshold ?? "high";

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put("/security/settings", {
        ip_allowlist: ipList,
        notify_threshold: threshold,
      }),
    onSuccess: () => {
      toast({ title: "Security settings saved" });
      setLocalIpList(null);
      setLocalThreshold(null);
      queryClient.invalidateQueries({ queryKey: ["security", "settings"] });
    },
    onError: () =>
      toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const CIDR_RE =
    /^(\d{1,3}\.){3}\d{1,3}(\/([12]?\d|3[0-2]))?$|^[0-9a-fA-F:]+(?:\/(?:12[0-8]|1[01]\d|[1-9]\d|\d))?$/;

  const addCidr = () => {
    const cidr = ipInput.trim();
    if (!cidr) return;
    if (ipList.includes(cidr)) {
      setCidrError("This IP/range is already in the list.");
      return;
    }
    if (!CIDR_RE.test(cidr)) {
      setCidrError(
        "Invalid format — use an IPv4/IPv6 address or CIDR range (e.g. 203.0.113.0/24)",
      );
      return;
    }
    setCidrError("");
    setLocalIpList([...ipList, cidr]);
    setIpInput("");
  };

  const removeCidr = (cidr: string) =>
    setLocalIpList(ipList.filter((x) => x !== cidr));

  const isDirty = localIpList !== null || localThreshold !== null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            IP Allowlist
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Restrict API access to specific IP ranges. Leave empty to allow all
            IPs. Docker/localhost ranges are always allowed. These entries are
            also merged into WP Secure Guard during install and update jobs.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={ipInput}
              onChange={(e) => {
                setIpInput(e.target.value);
                if (cidrError) setCidrError("");
              }}
              placeholder="e.g. 203.0.113.0/24 or 198.51.100.42"
              className="h-8 text-xs flex-1"
              onKeyDown={(e) => e.key === "Enter" && addCidr()}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={addCidr}
              disabled={!ipInput.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
          {cidrError && <p className="text-xs text-destructive">{cidrError}</p>}
          {ipList.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No restrictions — all IPs allowed.
            </p>
          ) : (
            <div className="space-y-1">
              {ipList.map((cidr) => (
                <div
                  key={cidr}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded bg-muted/50 text-xs font-mono"
                >
                  <span>{cidr}</span>
                  <button
                    onClick={() => removeCidr(cidr)}
                    className="text-muted-foreground hover:text-destructive ml-3"
                    aria-label={`Remove ${cidr} from allowlist`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Global Alert Threshold
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Minimum severity level that triggers global security notifications.
            Per-schedule thresholds override this.
          </p>
        </CardHeader>
        <CardContent>
          <Select value={threshold} onValueChange={(v) => setLocalThreshold(v)}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["critical", "high", "medium", "low", "info"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)} and above
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!isDirty || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
