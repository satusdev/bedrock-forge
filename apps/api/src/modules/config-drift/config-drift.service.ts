import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigDriftRepository } from "./config-drift.repository";
import { NotificationsService } from "../notifications/notifications.service";


export interface Plugin {
  slug: string;
  version?: string;
  name?: string;
}

export interface PhpSettings {
  [key: string]: string;
}

export interface PluginDiff {
  slug: string;
  name?: string;
  baselineVersion: string | null;
  envVersion: string | null;
  status: "match" | "mismatch" | "missing" | "extra";
}

export interface PhpDiff {
  key: string;
  baselineValue: string;
  envValue: string;
}

@Injectable()
export class ConfigDriftService {
  private readonly logger = new Logger(ConfigDriftService.name);

  constructor(
    private readonly repo: ConfigDriftRepository,
    private readonly notifications: NotificationsService,
  ) {}


  async getDrift(projectId: number) {
    const envs = await this.repo.getProjectEnvironmentsWithScans(
      BigInt(projectId),
    );
    if (!envs.length) {
      return {
        baselineEnvId: null,
        message: "No environments found",
        diffs: [],
      };
    }

    const baseline = envs.find((e) => e.is_baseline);
    if (!baseline) {
      return {
        baselineEnvId: null,
        message: "No baseline environment set",
        diffs: [],
      };
    }

    const baselineScan = baseline.plugin_scans[0] ?? null;
    const baselinePlugins = this.extractPlugins(baselineScan);
    const baselinePhp = this.extractPhpSettings(baselineScan);

    const diffs = envs
      .filter((e) => !e.is_baseline)
      .map((env) => {
        const scan = env.plugin_scans[0] ?? null;
        const envPlugins = this.extractPlugins(scan);
        const envPhp = this.extractPhpSettings(scan);

        return {
          environmentId: Number(env.id),
          type: env.type,
          url: env.url,
          scannedAt: scan ? scan.scanned_at : null,
          pluginDiffs: this.comparePlugins(baselinePlugins, envPlugins),
          phpDiffs:
            baselinePhp && envPhp ? this.comparePhp(baselinePhp, envPhp) : [],
          warnWpDebugEnabled: this.detectWpDebug(scan),
        };
      });

    return {
      baselineEnvId: Number(baseline.id),
      baselineType: baseline.type,
      baselineUrl: baseline.url,
      baselineScannedAt: baselineScan ? baselineScan.scanned_at : null,
      diffs,
    };
  }

  async setBaseline(projectId: number, envId: number) {
    const envs = await this.repo.getProjectEnvironmentsWithScans(
      BigInt(projectId),
    );
    const env = envs.find((e) => Number(e.id) === envId);
    if (!env)
      throw new NotFoundException(
        `Environment ${envId} not found in project ${projectId}`,
      );
    await this.repo.setBaseline(BigInt(projectId), BigInt(envId));
    return { baselineEnvId: envId };
  }

  async clearBaseline(projectId: number) {
    await this.repo.clearBaseline(BigInt(projectId));
    return { baselineEnvId: null };
  }

  // ── Drift Alerting Cron ───────────────────────────────────────────────────

  /**
   * Daily at 08:00 — scan all projects with a baseline for config drift.
   * If any diffs are found, dispatch a `config.drift_detected` notification.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkDriftForAllProjects(): Promise<void> {
    let projectIds: bigint[];
    try {
      projectIds = await this.repo.findProjectIdsWithBaseline();
    } catch (err) {
      this.logger.error(`Drift check failed to list projects: ${err}`);
      return;
    }

    if (projectIds.length === 0) return;

    for (const projectId of projectIds) {
      try {
        const result = await this.getDrift(Number(projectId));

        const drifted = result.diffs.filter(
          (d) =>
            d.pluginDiffs.some((p) => p.status !== "match") ||
            d.phpDiffs.length > 0 ||
            d.warnWpDebugEnabled,
        );

        if (drifted.length === 0) continue;

        const totalMismatches = drifted.reduce(
          (sum, d) => sum + d.pluginDiffs.filter((p) => p.status !== "match").length,
          0,
        );

        this.notifications.dispatch("config.drift_detected", {
          projectId: Number(projectId),
          baselineEnvId: result.baselineEnvId,
          driftedEnvironments: drifted.length,
          totalMismatches,
          environments: drifted.map((d) => ({
            environmentId: d.environmentId,
            type: d.type,
            url: d.url,
            mismatchCount: d.pluginDiffs.filter((p) => p.status !== "match").length,
            phpDriftCount: d.phpDiffs.length,
            warnWpDebug: d.warnWpDebugEnabled,
          })),
        });

        this.logger.warn(
          `Config drift detected for project #${projectId}: ${drifted.length} environment(s) drifted`,
        );
      } catch (err) {
        this.logger.error(`Drift check failed for project #${projectId}: ${err}`);
      }
    }
  }


  private extractPlugins(
    scan: { plugins: unknown } | null,
  ): Map<string, Plugin> {
    const map = new Map<string, Plugin>();
    if (!scan) return map;
    const data = scan.plugins as { plugins?: Plugin[] } | Plugin[] | null;
    const list: Plugin[] = Array.isArray(data) ? data : (data?.plugins ?? []);
    for (const p of list) {
      if (p?.slug) map.set(p.slug, p);
    }
    return map;
  }

  private extractPhpSettings(
    scan: { plugins: unknown } | null,
  ): PhpSettings | null {
    if (!scan) return null;
    const data = scan.plugins as { php_settings?: PhpSettings } | null;
    return data?.php_settings ?? null;
  }

  private comparePlugins(
    baseline: Map<string, Plugin>,
    target: Map<string, Plugin>,
  ): PluginDiff[] {
    const diffs: PluginDiff[] = [];
    const allSlugs = new Set([...baseline.keys(), ...target.keys()]);

    for (const slug of allSlugs) {
      const base = baseline.get(slug);
      const env = target.get(slug);

      if (!base) {
        diffs.push({
          slug,
          name: env?.name,
          baselineVersion: null,
          envVersion: env?.version ?? null,
          status: "extra",
        });
      } else if (!env) {
        diffs.push({
          slug,
          name: base.name,
          baselineVersion: base.version ?? null,
          envVersion: null,
          status: "missing",
        });
      } else if (base.version !== env.version) {
        diffs.push({
          slug,
          name: base.name,
          baselineVersion: base.version ?? null,
          envVersion: env.version ?? null,
          status: "mismatch",
        });
      } else {
        diffs.push({
          slug,
          name: base.name,
          baselineVersion: base.version ?? null,
          envVersion: env.version ?? null,
          status: "match",
        });
      }
    }

    // Sort: mismatch/missing/extra first, then match
    return diffs.sort((a, b) => {
      const order = { mismatch: 0, missing: 1, extra: 2, match: 3 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });
  }

  private comparePhp(baseline: PhpSettings, target: PhpSettings): PhpDiff[] {
    const diffs: PhpDiff[] = [];
    const allKeys = new Set([...Object.keys(baseline), ...Object.keys(target)]);
    for (const key of allKeys) {
      const bv = baseline[key] ?? "";
      const ev = target[key] ?? "";
      if (bv !== ev) {
        diffs.push({ key, baselineValue: bv, envValue: ev });
      }
    }
    return diffs;
  }

  private detectWpDebug(scan: { plugins: unknown } | null): boolean {
    if (!scan) return false;
    const data = scan.plugins as
      | { wp_debug?: boolean }
      | { plugins?: { is_active?: boolean }[] }
      | null;
    const asObj = data as Record<string, unknown> | null;
    return asObj?.wp_debug === true;
  }
}
