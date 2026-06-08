import React, { useState } from "react";
import { useWebSocketEvent } from "@/lib/websocket";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { WS_EVENTS } from "@bedrock-forge/shared";

export function SecurityScanProgress() {
  const [activeJobs, setActiveJobs] = useState<
    Record<string, { progress: number; step?: string }>
  >({});

  useWebSocketEvent(WS_EVENTS.JOB_PROGRESS, (data: any) => {
    if (data.queueName === "security") {
      setActiveJobs((prev) => ({
        ...prev,
        [data.jobId]: { progress: data.progress, step: data.step },
      }));
    }
  });

  useWebSocketEvent(WS_EVENTS.JOB_COMPLETED, (data: any) => {
    if (data.queueName === "security") {
      setActiveJobs((prev) => {
        const next = { ...prev };
        delete next[data.jobId];
        return next;
      });
    }
  });

  useWebSocketEvent(WS_EVENTS.JOB_FAILED, (data: any) => {
    if (data.queueName === "security") {
      setActiveJobs((prev) => {
        const next = { ...prev };
        delete next[data.jobId];
        return next;
      });
    }
  });

  const jobIds = Object.keys(activeJobs);
  if (jobIds.length === 0) return null;

  return (
    <div className="space-y-3 mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
      {jobIds.map((id) => {
        const job = activeJobs[id];
        return (
          <Card
            key={id}
            className="border-primary/20 bg-primary/5 overflow-hidden"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-semibold truncate">
                      Security Scan in Progress
                    </p>
                    <span className="text-xs font-mono font-medium text-primary">
                      {Math.round(job.progress)}%
                    </span>
                  </div>
                  <Progress value={job.progress} className="h-1.5" />
                  {job.step && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wider font-medium">
                      Current step:{" "}
                      <span className="text-foreground">{job.step}</span>
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
