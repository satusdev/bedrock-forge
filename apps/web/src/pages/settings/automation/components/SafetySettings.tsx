import React from "react";
import { Shield } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface SafetySettingsProps {
  data?: Record<string, string>;
  isLoading: boolean;
  isPending: boolean;
  onUpdate: (key: string, value: string) => void;
}

export function SafetySettings({
  data,
  isLoading,
  isPending,
  onUpdate,
}: SafetySettingsProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-success/10 rounded-lg">
            <Shield className="h-5 w-5 text-success" />
          </div>
          <div>
            <CardTitle className="text-lg">Safety & Safeguards</CardTitle>
            <CardDescription>
              Prevention mechanisms to ensure data integrity during operations.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-6 border rounded-xl p-5 bg-muted/20">
          <div className="space-y-1">
            <Label htmlFor="safety-backup-toggle" className="text-sm font-bold">
              Snapshot before sync
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
              Recommended. Automatically create a full backup of the target
              environment immediately before every sync operation.
            </p>
          </div>
          <Switch
            id="safety-backup-toggle"
            checked={data?.safety_backup_before_sync === "true"}
            onCheckedChange={(checked) =>
              onUpdate("safety_backup_before_sync", String(checked))
            }
            disabled={isLoading || isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
