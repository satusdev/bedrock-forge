import React from "react";
import { ManualBackupConfig } from "./components/ManualBackupConfig";
import { BackupScheduleConfig } from "./components/BackupScheduleConfig";
import { BackupHistoryList } from "./components/BackupHistoryList";

export function BackupTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
      <div className="space-y-6">
        <ManualBackupConfig />
        <BackupScheduleConfig />
      </div>
      <div>
        <BackupHistoryList />
      </div>
    </div>
  );
}
