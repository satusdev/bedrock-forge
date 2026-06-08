import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Clock, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { CronResult } from "../types";
import { toolsApi } from "../api";

export function WpCronJobsCard({
  selectedEnvId,
}: {
  selectedEnvId: number | null;
}) {
  const [showCron, setShowCron] = useState(false);
  const [cronData, setCronData] = useState<CronResult | null>(null);

  const cronMutation = useMutation({
    mutationFn: () => toolsApi.getCronJobs(selectedEnvId!),
    onSuccess: (data: CronResult) => {
      setCronData(data);
      setShowCron(true);
    },
    onError: () =>
      toast({ title: "Failed to fetch cron", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          WP Cron Jobs
        </CardTitle>
        <CardDescription>
          Inspect scheduled WordPress cron events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="outline"
          size="sm"
          disabled={cronMutation.isPending || !selectedEnvId}
          onClick={() => cronMutation.mutate()}
        >
          {cronMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
          )}
          {showCron ? "Reload Cron" : "Load Cron"}
        </Button>
        {showCron && cronData?.cron && (
          <div className="border rounded-md overflow-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Hook</th>
                  <th className="text-left px-3 py-2 font-medium">Schedule</th>
                  <th className="text-left px-3 py-2 font-medium">Next Run</th>
                </tr>
              </thead>
              <tbody>
                {cronData.cron.map((job, i) => (
                  <tr key={i} className="border-t hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs break-all max-w-xs">
                      {job.hook}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">
                        {job.schedule}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {job.next_run}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showCron && cronData?.error && (
          <p className="text-xs text-destructive">{cronData.error}</p>
        )}
      </CardContent>
    </Card>
  );
}
