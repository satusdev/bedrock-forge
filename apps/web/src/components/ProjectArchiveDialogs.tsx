import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Archive, RotateCcw, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Backup {
  id: number;
  created_at: string;
  type: string;
  status: string;
}

interface ArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: (options: { createBackup: boolean; deleteFromCyberpanel: boolean }) => void;
  isPending: boolean;
}

export function ArchiveDialog({
  open,
  onOpenChange,
  projectName,
  onConfirm,
  isPending,
}: ArchiveDialogProps) {
  const [createBackup, setCreateBackup] = useState(true);
  const [deleteFromCyberpanel, setDeleteFromCyberpanel] = useState(true);
  const [confirmName, setConfirmName] = useState("");

  const canConfirm = confirmName.trim() === projectName.trim();

  useEffect(() => {
    if (!open) {
      setConfirmName("");
      setCreateBackup(true);
      setDeleteFromCyberpanel(true);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Archive className="h-5 w-5" />
            Archive Project
          </DialogTitle>
          <DialogDescription>
            Archiving will transition the project to an archived status, disable all active schedules and monitors, and perform the selected deprovisioning tasks below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start space-x-3 rounded-xl border bg-muted/30 p-3.5">
            <Checkbox
              id="createBackup"
              checked={createBackup}
              onCheckedChange={(checked) => setCreateBackup(!!checked)}
              disabled={isPending}
            />
            <div className="space-y-1 leading-none">
              <label
                htmlFor="createBackup"
                className="text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Create final backups
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                Generate full backups (database + files) stored in Google Drive for all project environments before archival.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 rounded-xl border bg-muted/30 p-3.5">
            <Checkbox
              id="deleteFromCyberpanel"
              checked={deleteFromCyberpanel}
              onCheckedChange={(checked) => setDeleteFromCyberpanel(!!checked)}
              disabled={isPending}
            />
            <div className="space-y-1 leading-none">
              <label
                htmlFor="deleteFromCyberpanel"
                className="text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Deprovision from CyberPanel
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                Instantly delete the website and its databases from the CyberPanel server to free up system resources.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Label htmlFor="archive-confirm" className="text-xs text-muted-foreground font-medium">
              Confirm by typing the project name <span className="font-semibold text-foreground">{projectName}</span>:
            </Label>
            <Input
              id="archive-confirm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              disabled={isPending}
              placeholder={projectName}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm({ createBackup, deleteFromCyberpanel })}
            disabled={!canConfirm || isPending}
          >
            {isPending ? "Archiving..." : "Archive Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SharedEnvironment {
  id: number;
  type: string;
  server: { name: string };
}

interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environments: SharedEnvironment[];
  onConfirm: (environmentBackups: Record<string, number>) => void;
  isPending: boolean;
}

interface EnvBackupSelectProps {
  envId: number;
  onSelect: (backupId: number) => void;
  selectedBackupId: number | null;
}

function EnvBackupSelect({ envId, onSelect, selectedBackupId }: EnvBackupSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["backups", envId],
    queryFn: () =>
      api.get<{ items: Backup[]; total: number }>(
        `/backups/environment/${envId}?page=1&limit=50`,
      ),
  });

  const backups = data?.items.filter((b: Backup) => b.status === "completed") ?? [];

  useEffect(() => {
    if (backups.length > 0 && selectedBackupId === null) {
      onSelect(backups[0].id);
    }
  }, [backups, selectedBackupId, onSelect]);

  if (isLoading) {
    return <Skeleton className="h-9 w-full rounded-lg" />;
  }

  if (backups.length === 0) {
    return (
      <div className="text-xs text-destructive font-medium border border-destructive/20 bg-destructive/5 rounded-lg p-2 flex items-center gap-1.5">
        <XCircle className="h-3.5 w-3.5" />
        No completed backups found for this environment!
      </div>
    );
  }

  return (
    <Select
      value={selectedBackupId?.toString()}
      onValueChange={(val) => onSelect(Number(val))}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a backup to restore..." />
      </SelectTrigger>
      <SelectContent>
        {backups.map((b: Backup) => (
          <SelectItem key={b.id} value={b.id.toString()}>
            {new Date(b.created_at).toLocaleString()} ({b.type === "full" ? "Full" : b.type === "db_only" ? "Database" : "Files"})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RestoreDialog({
  open,
  onOpenChange,
  environments,
  onConfirm,
  isPending,
}: RestoreDialogProps) {
  const [selections, setSelections] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) {
      setSelections({});
    }
  }, [open]);

  // Determine if all environments have a selected backup
  const canRestore = environments.every((e) => selections[e.id] != null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <RotateCcw className="h-5 w-5" />
            Restore Project Archive
          </DialogTitle>
          <DialogDescription>
            This will recreate all environments on their respective servers in CyberPanel, and restore their database & file structure from the selected backups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 max-h-[350px] overflow-y-auto px-1">
          {environments.map((env) => (
            <div key={env.id} className="space-y-2 border rounded-xl p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold capitalize">{env.type} Environment</span>
                <span className="text-xs text-muted-foreground">{env.server.name}</span>
              </div>
              <EnvBackupSelect
                envId={env.id}
                selectedBackupId={selections[env.id] || null}
                onSelect={(backupId) =>
                  setSelections((prev) => ({ ...prev, [env.id]: backupId }))
                }
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0"
            onClick={() => onConfirm(selections)}
            disabled={!canRestore || isPending}
          >
            {isPending ? "Restoring..." : "Restore Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
