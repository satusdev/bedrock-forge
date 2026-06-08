// ─── Shared types for the Security feature ───────────────────────────────────

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  remediation?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}

export interface ScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ServerSummary {
  id: number;
  name: string;
  ip_address: string;
  status: string;
  score: number | null;
  findings_summary: ScanSummary;
  last_scanned_at: string | null;
}

export interface EnvironmentSummary {
  id: number;
  type: string;
  url: string;
  project: { id: number; name: string };
  server: { id: number; name: string };
  score: number | null;
  findings_summary: ScanSummary;
  last_scanned_at: string | null;
}

export interface OverviewData {
  servers: (ServerSummary & {
    scans: {
      id: number;
      scan_type: string;
      score: number | null;
      summary: ScanSummary | null;
      completed_at: string | null;
    }[];
  })[];
  environments: EnvironmentSummary[];
  totals: {
    servers_scanned: number;
    environments_scanned: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    global_score: number | null;
  };
  history: { date: string; score: number }[];
}

export interface ScanRecord {
  id: number;
  scan_type: string;
  status: string;
  score: number | null;
  summary: ScanSummary | null;
  findings: SecurityFinding[] | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ScanHistory {
  data: ScanRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LogEntry {
  scan_id: number;
  server_id: number | null;
  server_name: string | null;
  server_ip: string | null;
  scanned_at: string | null;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  resource: string | null;
  metadata: Record<string, unknown> | null;
}

export interface LogsResponse {
  data: LogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SecuritySchedule {
  id?: number;
  scan_types: string[];
  frequency: "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  day_of_week?: number | null;
  day_of_month?: number | null;
  enabled: boolean;
  last_run_at?: string | null;
  notify_enabled: boolean;
  notify_threshold: string;
}

export interface ServerSecurityAlertSetting {
  id?: number;
  server_id: number;
  enabled: boolean;
  ssh_login_alerts_enabled: boolean;
  file_change_alerts_enabled: boolean;
  interval_minutes: number;
  file_watch_paths: string[];
  last_checked_at?: string | null;
  last_auth_cursor?: string | null;
  file_snapshot?: Record<string, unknown> | null;
}

export interface SecuritySettings {
  ip_allowlist: string[];
  notify_threshold: string;
}

export interface FindingAck {
  note: string | null;
  acknowledged_by_name: string;
  created_at: string;
}

export interface FindingRow {
  scan_id: number;
  finding_id: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  remediation?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  scan_type: string;
  scanned_at: string | null;
  server_id: number | null;
  server_name: string | null;
  server_ip: string | null;
  environment_id: number | null;
  environment_type: string | null;
  project_name: string | null;
  scope_key: string;
  ack: FindingAck | null;
}

export interface FindingsResponse {
  data: FindingRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SessionItem {
  id: number;
  created_at: string;
  expires_at: string;
  user_agent: string | null;
  ip_address: string | null;
}

export interface ReportChannel {
  id: number;
  name: string;
  active: boolean;
  has_token: boolean;
}

export interface SecurityReportExecution {
  id: string;
  status: string;
  progress: number | null;
  last_error: string | null;
  payload: {
    serverIds?: number[];
    environmentIds?: number[];
    channelIds?: number[];
  } | null;
  execution_log: unknown[] | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type HardeningResult = {
  ts: string;
  step: string;
  level: string;
  detail?: string;
  hardenStatus?: "applied" | "skipped" | "failed";
};
