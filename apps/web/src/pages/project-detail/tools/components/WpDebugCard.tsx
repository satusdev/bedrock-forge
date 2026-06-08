import { useState } from "react";
import { Bug, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Environment } from "../types";
import { REVERT_OPTIONS } from "../utils";
import { useDebugStatusQuery, useDebugMutation } from "../hooks";

export function WpDebugCard({
  selectedEnvId,
  selectedEnv,
}: {
  selectedEnvId: number | null;
  selectedEnv?: Environment;
}) {
  const [debugRevertMin, setDebugRevertMin] = useState("0");

  const {
    data: debugStatus,
    isLoading: debugLoading,
    refetch: refetchDebug,
  } = useDebugStatusQuery(selectedEnvId);

  const debugMutation = useDebugMutation(selectedEnvId, debugRevertMin);

  const debugEnabled =
    debugStatus?.now_enabled ?? debugStatus?.was_enabled ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bug className="h-4 w-4" />
          WP_DEBUG Mode
        </CardTitle>
        <CardDescription>
          Enable or disable WordPress debug logging.
          {selectedEnv?.type === "production" && (
            <span className="text-amber-500 ml-1 font-medium">
              ⚠ Production environment — use with caution
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            {debugLoading ? (
              <Skeleton className="h-6 w-12 rounded-full" />
            ) : (
              <Switch
                checked={debugEnabled}
                onCheckedChange={(v) => debugMutation.mutate({ enabled: v })}
                disabled={debugMutation.isPending || !selectedEnvId}
              />
            )}
            <Label className="text-sm">
              WP_DEBUG{" "}
              <Badge
                variant={debugEnabled ? "destructive" : "secondary"}
                className="text-xs ml-1"
              >
                {debugEnabled ? "ENABLED" : "disabled"}
              </Badge>
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground shrink-0">
              Auto-revert:
            </Label>
            <Select value={debugRevertMin} onValueChange={setDebugRevertMin}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVERT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetchDebug()}
            disabled={debugLoading || !selectedEnvId}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
