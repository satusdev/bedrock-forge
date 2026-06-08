export interface Environment {
  id: number;
  type: string;
  url?: string;
  google_drive_folder_id?: string | null;
  protected_tables?: string[];
  sql_protection_queries?: string[];
  protected_post_types?: string[];
  server: { name: string };
}

export interface JobProgress {
  jobId: string;
  progress: number;
  message: string;
  step?: string;
}

export interface JobResult {
  jobId: string;
  status: string;
  message?: string;
}

export interface JobExecutionRow {
  id: number;
  queue_name: string;
  job_type?: string | null;
  status: string;
  progress: number | null;
  last_error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  environment: {
    id: number;
    type: string;
    url: string | null;
    project: { id: number; name: string; client: { id: number; name: string } };
  } | null;
}

export interface SyncHistoryPage {
  data: JobExecutionRow[];
  total: number;
}

export type Scope = "database" | "files" | "both";
