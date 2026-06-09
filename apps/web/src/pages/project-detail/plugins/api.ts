import { api } from "@/lib/api-client";
import { WpOrgSearchResult } from "@bedrock-forge/shared";
import {
  PluginScan,
  JobExecutionLogStatus,
  CustomPlugin,
  EnvironmentCustomPlugin,
  PluginUpdateSchedule,
} from "./types";

export const pluginsApi = {
  searchWpOrg: (query: string) =>
    api.get<WpOrgSearchResult[]>(
      `/plugin-scans/search-wp-org?query=${encodeURIComponent(query)}`,
    ),

  installPlugin: (
    envId: number,
    body: {
      slug: string;
      version?: string;
      workflow: "composer" | "manual";
      skipSafetyBackup: boolean;
    },
  ) =>
    api.post<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/plugins`,
      body,
    ),

  getScans: (envId: number) =>
    api.get<{ items: PluginScan[] }>(
      `/plugin-scans/environment/${envId}?limit=1`,
    ),

  getJobExecutionLog: (jobExecutionId: number) =>
    api.get<JobExecutionLogStatus>(`/job-executions/${jobExecutionId}/log`),

  getCustomCatalog: () => api.get<CustomPlugin[]>("/custom-plugins"),

  getEnvCustomPlugins: (envId: number) =>
    api.get<EnvironmentCustomPlugin[]>(
      `/plugin-scans/environment/${envId}/custom-plugins`,
    ),

  scanEnvironment: (envId: number) =>
    api.post<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/scan`,
      {},
    ),

  updateAllPlugins: (envId: number, body: { skipSafetyBackup: boolean }) =>
    api.put<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/plugins`,
      body,
    ),

  removePlugin: (
    envId: number,
    slug: string,
    body: { skipSafetyBackup: boolean },
  ) =>
    api.delete<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/plugins/${slug}`,
      body,
    ),

  updatePlugin: (
    envId: number,
    slug: string,
    body: { skipSafetyBackup: boolean },
  ) =>
    api.put<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/plugins/${slug}`,
      body,
    ),

  changePluginConstraint: (
    envId: number,
    slug: string,
    body: { constraint: string },
  ) =>
    api.patch<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/plugins/${slug}/constraint`,
      body,
    ),

  togglePluginStatus: (
    envId: number,
    slug: string,
    body: { active: boolean; skipSafetyBackup: boolean },
  ) =>
    api.put<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/plugins/${slug}/status`,
      body,
    ),

  migrateToComposer: (
    envId: number,
    slug: string,
    body: { skipSafetyBackup: boolean },
  ) =>
    api.post<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/plugins/${slug}/migrate-to-composer`,
      body,
    ),

  uninstallCustomPlugin: (envId: number, customPluginId: number) =>
    api.delete<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/custom-plugins/${customPluginId}`,
    ),

  updateCustomPlugin: (envId: number, customPluginId: number) =>
    api.put<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/custom-plugins/${customPluginId}`,
      {},
    ),

  installCustomPlugin: (envId: number, customPluginId: number) =>
    api.post<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/custom-plugins/${customPluginId}`,
      {},
    ),

  checkCustomPluginVersions: (envId: number) =>
    api.post(
      `/plugin-scans/environment/${envId}/custom-plugins/check-versions`,
      {},
    ),

  readComposerJson: (envId: number) =>
    api.post<{ jobExecutionId: number; bullJobId: string }>(
      `/plugin-scans/environment/${envId}/composer`,
      {},
    ),

  getPluginUpdateSchedule: (envId: number) =>
    api.get<PluginUpdateSchedule>(
      `/environments/${envId}/plugin-update-schedule`,
    ),

  savePluginUpdateSchedule: (
    envId: number,
    body: {
      enabled: boolean;
      frequency: "daily" | "weekly" | "monthly";
      hour: number;
      minute: number;
      day_of_week?: number;
      day_of_month?: number;
    },
  ) =>
    api.put<PluginUpdateSchedule>(
      `/environments/${envId}/plugin-update-schedule`,
      body,
    ),

  deletePluginUpdateSchedule: (envId: number) =>
    api.delete(`/environments/${envId}/plugin-update-schedule`),
};
