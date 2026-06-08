export interface GdriveStatus {
  configured: boolean;
}

export interface SystemBackupItem {
  id: number;
  status: "pending" | "running" | "completed" | "failed";
  file_path: string | null;
  size_bytes: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  jobExecution?: {
    status: string;
    progress: number;
    last_error: string | null;
  } | null;
}

export interface SystemBackupList {
  items: SystemBackupItem[];
  total: number;
  page: number;
  limit: number;
}

export interface SystemBackupSchedule {
  id: number;
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  day_of_week: number | null;
  day_of_month: number | null;
  enabled: boolean;
  retention_count: number | null;
  retention_days: number | null;
  last_run_at: string | null;
}
