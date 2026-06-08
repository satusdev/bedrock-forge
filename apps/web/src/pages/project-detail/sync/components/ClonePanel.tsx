import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Database,
  ShieldOff,
} from "lucide-react";
import { useWebSocketEvent } from "@/lib/websocket";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Environment, JobProgress, JobResult } from "../types";
import { syncApi } from "../api";
import { EnvCard } from "./EnvCard";
import { JobProgressPanel } from "./JobProgressPanel";

export function ClonePanel({
  projectId,
  environments,
}: {
  projectId: number;
  environments: Environment[];
}) {
  const qc = useQueryClient();
  const [sourceId, setSourceId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [skipSafetyBackup, setSkipSafetyBackup] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobExecutionId, setJobExecutionId] = useState<number | null>(null);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [jobDone, setJobDone] = useState<JobResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const source = environments.find((e) => e.id.toString() === sourceId) ?? null;
  const target = environments.find((e) => e.id.toString() === targetId) ?? null;

  const cloneMutation = useMutation({
    mutationFn: () =>
      syncApi.cloneEnvironment({
        sourceEnvironmentId: Number(sourceId),
        targetEnvironmentId: Number(targetId),
        skipSafetyBackup,
      }),
    onSuccess: (res) => {
      setJobId(res.jobId);
      setJobExecutionId(res.jobExecutionId);
      setJobDone(null);
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["sync-history", projectId] });
      toast({ title: "Sync job queued", description: `Job ${res.jobId}` });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to queue sync";
      toast({
        title: "Sync failed to queue",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const cancelCloneMutation = useMutation({
    mutationFn: (execId: number) => syncApi.cancelSyncExecution(execId),
    onSuccess: () => {
      setJobId(null);
      setJobExecutionId(null);
      setProgress(null);
      setJobDone({ jobId: "", status: "failed", message: "Cancelled by user" });
      qc.invalidateQueries({ queryKey: ["sync-history", projectId] });
      toast({ title: "Clone job cancelled" });
    },
    onError: () =>
      toast({ title: "Could not cancel clone", variant: "destructive" }),
  });

  useWebSocketEvent("job:progress", (raw: unknown) => {
    const p = raw as JobProgress;
    if (p.jobId === jobId) setProgress(p);
  });
  useWebSocketEvent("job:completed", (raw: unknown) => {
    const r = raw as JobResult;
    if (r.jobId === jobId) {
      setJobDone({ ...r, status: "completed" });
      qc.invalidateQueries({ queryKey: ["sync-history", projectId] });
      toast({ title: "Clone completed successfully" });
    }
  });
  useWebSocketEvent("job:failed", (raw: unknown) => {
    const r = raw as JobResult;
    if (r.jobId === jobId) {
      setJobDone({ ...r, status: "failed" });
      qc.invalidateQueries({ queryKey: ["sync-history", projectId] });
      toast({
        title: "Clone failed",
        description: r.message,
        variant: "destructive",
      });
    }
  });

  const hasGdrive =
    skipSafetyBackup || !target || !!target.google_drive_folder_id;
  const canSync = sourceId && targetId && sourceId !== targetId && hasGdrive;
  const isBusy = cloneMutation.isPending || (!!jobId && !jobDone);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Clones the database from source to target (mysqldump + import + URL
        search-replace). A safety backup is uploaded to Google Drive before
        overwriting.
      </p>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-end">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Source</label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger>
              <SelectValue placeholder="Select source…" />
            </SelectTrigger>
            <SelectContent>
              {environments.map((e) => (
                <SelectItem
                  key={e.id}
                  value={e.id.toString()}
                  disabled={e.id.toString() === targetId}
                >
                  <span className="capitalize">{e.type}</span>
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    ({e.server.name})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="pb-2">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Target (will be overwritten)
          </label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger>
              <SelectValue placeholder="Select target…" />
            </SelectTrigger>
            <SelectContent>
              {environments.map((e) => (
                <SelectItem
                  key={e.id}
                  value={e.id.toString()}
                  disabled={e.id.toString() === sourceId}
                >
                  <span className="capitalize">{e.type}</span>
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    ({e.server.name})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <EnvCard env={source} label="Source" />
        <ArrowRight className="h-6 w-6 text-muted-foreground flex-none" />
        <EnvCard env={target} label="Target" />
      </div>

      {target?.protected_tables && target.protected_tables.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/40">
          <Database className="h-4 w-4 mt-0.5 flex-none text-blue-500" />
          <div>
            <p className="font-medium text-blue-700 dark:text-blue-400">
              Protected tables will be preserved
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {target.protected_tables.join(", ")} — these tables on the target
              will not be overwritten or URL-replaced
            </p>
          </div>
        </div>
      )}

      {target?.protected_post_types &&
        target.protected_post_types.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm dark:border-purple-800 dark:bg-purple-950/40">
            <Database className="h-4 w-4 mt-0.5 flex-none text-purple-500" />
            <div>
              <p className="font-medium text-purple-700 dark:text-purple-400">
                Protected custom post types will be preserved
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {target.protected_post_types.join(", ")} — target data for these
                post types will be backed up and restored during database sync.
              </p>
            </div>
          </div>
        )}

      {target?.sql_protection_queries &&
        target.sql_protection_queries.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-800 dark:bg-indigo-950/40">
            <Database className="h-4 w-4 mt-0.5 flex-none text-indigo-500" />
            <div>
              <p className="font-medium text-indigo-700 dark:text-indigo-400">
                SQL protection queries will run
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {target.sql_protection_queries.length} query/queries will
                execute on target database immediately after import:
              </p>
              <ul className="list-disc pl-4 mt-1 text-xs text-muted-foreground font-mono space-y-0.5">
                {target.sql_protection_queries.map((q, idx) => (
                  <li key={idx} className="truncate max-w-[500px]" title={q}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

      {target && !target.google_drive_folder_id && !skipSafetyBackup && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-none text-amber-500" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Google Drive folder required
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              A safety backup is mandatory before overwriting the target. Set a
              Google Drive folder on the <strong>{target.type}</strong>{" "}
              environment, or enable "Skip safety backup" below.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2.5">
        <Switch
          id="clone-skip-backup"
          checked={skipSafetyBackup}
          onCheckedChange={setSkipSafetyBackup}
          className="mt-0.5 shrink-0"
        />
        <div className="space-y-0.5">
          <Label
            htmlFor="clone-skip-backup"
            className="flex items-center gap-1.5 cursor-pointer text-sm font-medium"
          >
            <ShieldOff className="h-3.5 w-3.5 text-amber-500" />
            Skip safety backup
          </Label>
          <p className="text-xs text-muted-foreground">
            Bypasses the mandatory pre-sync backup. Use only if you accept the
            risk of data loss.
          </p>
        </div>
      </div>

      {skipSafetyBackup && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-none" />
          <span>
            <strong>No backup will be taken.</strong> If the sync fails there
            will be no automatic recovery point.
          </span>
        </div>
      )}

      <Button
        disabled={!canSync || isBusy}
        variant="destructive"
        onClick={() => setConfirmOpen(true)}
      >
        <RefreshCw
          className={`h-4 w-4 mr-1.5 ${isBusy ? "animate-spin" : ""}`}
        />
        {isBusy ? "Cloning…" : "Start Clone"}
      </Button>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          skipSafetyBackup
            ? "Confirm Clone — NO backup will be taken"
            : "Confirm Clone — This will overwrite data"
        }
        description={
          skipSafetyBackup
            ? `You have opted to skip the safety backup. The ${target?.type ?? ""} environment will be completely overwritten — with NO prior backup.`
            : `The ${target?.type ?? ""} environment on ${target?.server.name ?? ""} will be completely overwritten with data from ${source?.type ?? ""}. A backup snapshot will be taken first.`
        }
        confirmLabel="Yes, start clone"
        confirmVariant="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          cloneMutation.mutate();
        }}
      />

      <JobProgressPanel
        progress={progress}
        jobDone={jobDone}
        jobExecutionId={jobExecutionId}
        isBusy={isBusy}
        onCancel={
          jobExecutionId && !jobDone
            ? () => cancelCloneMutation.mutate(jobExecutionId)
            : undefined
        }
        isCancelling={cancelCloneMutation.isPending}
      />
    </div>
  );
}
