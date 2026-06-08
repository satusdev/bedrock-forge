export interface Environment {
  id: number;
  type: string;
  server: { name: string };
}

export interface Plugin {
  slug: string;
  name: string;
  version: string;
  latest_version: string | null;
  update_available: boolean;
  author: string | null;
  plugin_uri: string | null;
  description: string | null;
  managed_by_composer: boolean;
  composer_constraint: string | null;
  is_mu_plugin?: boolean;
  managed_by_monorepo?: boolean;
  monorepo_repo_url?: string | null;
  status?: "active" | "inactive";
}

export interface PluginScanOutput {
  is_bedrock: boolean;
  plugins: Plugin[];
}

export interface PluginScan {
  id: number;
  plugins: PluginScanOutput | Plugin[];
  scanned_at: string;
}

export interface CustomPlugin {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  repo_url: string;
  repo_path: string;
  type: string;
}

export interface EnvironmentCustomPlugin {
  id: number;
  custom_plugin_id: number;
  installed_version: string | null;
  latest_version: string | null;
  version_checked_at: string | null;
  created_at: string;
  custom_plugin: CustomPlugin;
}

export interface CustomCatalogRow {
  catalog: CustomPlugin;
  entry?: EnvironmentCustomPlugin;
  scanned?: Plugin;
  statusLabel: string;
  statusTone: "default" | "success" | "muted" | "warning";
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}

export interface JobExecutionLogStatus {
  id: number;
  status: "queued" | "active" | "completed" | "failed" | "dead_letter" | string;
  execution_log: Array<{ step: string; detail?: string }> | null;
  last_error?: string | null;
  completed_at?: string | null;
}

export interface PluginUpdateSchedule {
  id: number;
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  day_of_week: number | null;
  day_of_month: number | null;
  last_run_at: string | null;
}
