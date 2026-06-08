import React from "react";
import { Zap, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface AdvancedAutomationProps {
  data?: Record<string, string>;
  isLoading: boolean;
  isPending: boolean;
  onUpdate: (key: string, value: string) => void;
}

export function AdvancedAutomation({
  data,
  isLoading,
  isPending,
  onUpdate,
}: AdvancedAutomationProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-warning/10 rounded-lg">
            <Zap className="h-5 w-5 text-warning" />
          </div>
          <div>
            <CardTitle className="text-lg">Advanced Automation</CardTitle>
            <CardDescription>
              Intelligent background tasks to keep your systems updated.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between gap-6 border rounded-xl p-5 bg-muted/20">
          <div className="space-y-1">
            <Label className="text-sm font-bold">
              Auto-update security plugins
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
              Attempt to automatically update core Bedrock Forge security
              plugins (WP Secure Guard, etc.) on managed servers.
            </p>
          </div>
          <Switch
            checked={data?.auto_update_plugins === "true"}
            onCheckedChange={(checked) =>
              onUpdate("auto_update_plugins", String(checked))
            }
            disabled={isLoading || isPending}
          />
        </div>

        <div className="mt-2 flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <AlertCircle className="h-4 w-4 text-warning mt-0.5" />
          <p className="text-[11px] text-warning">
            <strong>Note:</strong> Auto-updates are only attempted for plugins
            maintained by Bedrock Forge to ensure stability.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
