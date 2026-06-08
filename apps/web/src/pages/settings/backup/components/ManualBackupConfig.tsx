import React, { useState, useEffect } from "react";
import { Database, HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  useGdriveStatus,
  useSystemBackupFolder,
  useSaveBackupFolderMutation,
  useTriggerBackupMutation,
} from "../hooks";

export function ManualBackupConfig() {
  const [systemBackupFolderId, setSystemBackupFolderId] = useState("");

  const { data: gdriveStatus } = useGdriveStatus();
  const { data: systemBackupFolder } = useSystemBackupFolder();

  useEffect(() => {
    if (systemBackupFolder?.folder_id) {
      setSystemBackupFolderId(systemBackupFolder.folder_id);
    }
  }, [systemBackupFolder?.folder_id]);

  const saveBackupFolder = useSaveBackupFolderMutation();
  const triggerBackup = useTriggerBackupMutation();

  return (
    <div className="border rounded-lg p-4 bg-card space-y-4">
      <h2 className="font-semibold flex items-center gap-2">
        <Database className="h-4 w-4" />
        Forge System Backup
      </h2>
      <p className="text-sm text-muted-foreground">
        Dumps the Forge PostgreSQL database using{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">pg_dump</code>{" "}
        and uploads the compressed file to a Google Drive folder you specify.
        Google Drive must be configured in the Integrations tab first.
      </p>

      {!gdriveStatus?.configured && (
        <div className="text-sm px-3 py-2 rounded-md bg-warning/10 text-warning">
          ⚠️ Google Drive is not configured. Go to the Integrations tab to set
          it up before running system backups.
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="backup-folder-id">Google Drive Folder ID</Label>
        <p className="text-xs text-muted-foreground">
          Open the destination folder in Google Drive. The folder ID is the last
          part of the URL:{" "}
          <code className="bg-muted px-1 py-0.5 rounded">
            drive.google.com/drive/folders/
            <strong>FOLDER_ID</strong>
          </code>
        </p>
        <div className="flex gap-2">
          <input
            id="backup-folder-id"
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2ucxE"
            value={systemBackupFolderId}
            onChange={(e) => setSystemBackupFolderId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
          />
          <Button
            onClick={() => saveBackupFolder.mutate(systemBackupFolderId.trim())}
            disabled={
              saveBackupFolder.isPending || !systemBackupFolderId.trim()
            }
          >
            {saveBackupFolder.isPending ? "Saving\u2026" : "Save"}
          </Button>
        </div>
        {systemBackupFolder?.folder_id && (
          <p className="text-xs text-muted-foreground">
            Current:{" "}
            <code className="bg-muted px-1 py-0.5 rounded">
              {systemBackupFolder.folder_id}
            </code>
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <div>
          <p className="text-sm font-medium">Manual Backup</p>
          <p className="text-xs text-muted-foreground">
            Trigger an immediate pg_dump → Google Drive upload.
          </p>
        </div>
        <Button
          onClick={() => triggerBackup.mutate()}
          disabled={
            triggerBackup.isPending ||
            !gdriveStatus?.configured ||
            !systemBackupFolder?.folder_id
          }
        >
          {triggerBackup.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Starting\u2026
            </>
          ) : (
            <>
              <HardDrive className="h-3.5 w-3.5 mr-1.5" />
              Backup Now
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
