import { useState } from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";
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
import { REVERT_OPTIONS } from "../utils";
import { useMaintenanceStatusQuery, useMaintenanceMutation } from "../hooks";

export function MaintenanceModeCard({
  selectedEnvId,
}: {
  selectedEnvId: number | null;
}) {
  const [maintenanceRevertMin, setMaintenanceRevertMin] = useState("0");

  const {
    data: maintenanceStatus,
    isLoading: maintenanceLoading,
    refetch: refetchMaintenance,
  } = useMaintenanceStatusQuery(selectedEnvId);

  const maintenanceMutation = useMaintenanceMutation(
    selectedEnvId,
    maintenanceRevertMin,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4" />
          Maintenance Mode
        </CardTitle>
        <CardDescription>
          Take WordPress temporarily offline and restore access automatically
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            {maintenanceLoading ? (
              <Skeleton className="h-6 w-12 rounded-full" />
            ) : (
              <Switch
                checked={maintenanceStatus?.enabled ?? false}
                onCheckedChange={(v) =>
                  maintenanceMutation.mutate({ enabled: v })
                }
                disabled={maintenanceMutation.isPending || !selectedEnvId}
              />
            )}
            <Label className="text-sm">
              Mode{" "}
              <Badge
                variant={
                  maintenanceStatus?.enabled ? "destructive" : "secondary"
                }
                className="text-xs ml-1"
              >
                {maintenanceStatus?.enabled ? "ACTIVE" : "inactive"}
              </Badge>
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground shrink-0">
              Auto-disable:
            </Label>
            <Select
              value={maintenanceRevertMin}
              onValueChange={setMaintenanceRevertMin}
            >
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
            onClick={() => void refetchMaintenance()}
            disabled={maintenanceLoading || !selectedEnvId}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
          {maintenanceStatus?.source && (
            <span className="text-xs text-muted-foreground">
              {maintenanceStatus.source}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
