import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { JOB_TYPES, QUEUES } from "@bedrock-forge/shared";
import { CustomPluginsRepository } from "./custom-plugins.repository";
import { GithubService } from "./github.service";
import { CreateCustomPluginDto } from "./dto/create-custom-plugin.dto";
import { UpdateCustomPluginDto } from "./dto/update-custom-plugin.dto";
import { JobOrchestratorService } from "../job-executions/job-orchestrator.service";

@Injectable()
export class CustomPluginsService {
  constructor(
    private readonly repo: CustomPluginsRepository,
    private readonly github: GithubService,
    private readonly jobOrchestrator: JobOrchestratorService,
    @InjectQueue(QUEUES.CUSTOM_PLUGINS)
    private readonly customQueue: Queue,
  ) {}

  async findAll() {
    const plugins = await this.repo.findAll();
    return Promise.all(
      plugins.map(async (plugin) => {
        const inventory = await this.buildInventory(plugin);
        return {
          ...plugin,
          inventory_summary: inventory.summary,
        };
      }),
    );
  }

  async findById(id: number) {
    const plugin = await this.repo.findById(BigInt(id));
    if (!plugin) throw new NotFoundException(`Custom plugin ${id} not found`);
    return plugin;
  }

  create(dto: CreateCustomPluginDto) {
    return this.repo.create(dto);
  }

  async update(id: number, dto: UpdateCustomPluginDto) {
    await this.findById(id);
    return this.repo.update(BigInt(id), dto);
  }

  async delete(id: number) {
    await this.findById(id);
    const count = await this.repo.countInstallations(BigInt(id));
    if (count > 0) {
      throw new ConflictException(
        `Cannot delete: plugin is installed on ${count} environment(s). Uninstall it first.`,
      );
    }
    return this.repo.delete(BigInt(id));
  }

  async getLatestTag(
    repoUrl: string,
    repoPath: string = ".",
    type: string = "plugin",
    slug?: string,
  ): Promise<string | null> {
    return this.github.getLatestTag(repoUrl, repoPath, type, slug);
  }

  async getInventory(id: number) {
    const plugin = await this.findById(id);
    return this.buildInventory(plugin);
  }

  private async buildInventory(plugin: {
    id: bigint;
    slug: string;
    repo_url?: string;
  }) {
    const rows = await this.repo.findInventoryData(plugin.id);
    const inventory = rows.map((env) => {
      const latestScan = env.plugin_scans[0] ?? null;
      const scanPlugin = this.findPluginInScan(
        latestScan?.plugins,
        plugin.slug,
      );
      const install = env.custom_plugins[0] ?? null;
      const scannedVersion = scanPlugin?.version ?? null;
      const installedVersion = install?.installed_version ?? scannedVersion;
      const latestVersion = install?.latest_version ?? null;
      const outdated =
        installedVersion != null &&
        latestVersion != null &&
        installedVersion !== latestVersion;

      return {
        environment: {
          id: Number(env.id),
          type: env.type,
          url: env.url,
          project: {
            id: Number(env.project.id),
            name: env.project.name,
            client: {
              id: Number(env.project.client.id),
              name: env.project.client.name,
            },
          },
          server: {
            id: Number(env.server.id),
            name: env.server.name,
            ip_address: env.server.ip_address,
          },
        },
        status: install ? "installed" : scanPlugin ? "detected" : "absent",
        installed: !!install,
        detected: !!scanPlugin,
        scanned_version: scannedVersion,
        installed_version: installedVersion,
        latest_version: latestVersion,
        outdated,
        last_scanned_at: latestScan?.scanned_at ?? null,
        version_checked_at: install?.version_checked_at ?? null,
      };
    });

    return {
      plugin,
      inventory,
      summary: {
        environments: inventory.length,
        installed: inventory.filter((row) => row.installed).length,
        detected: inventory.filter((row) => row.detected).length,
        outdated: inventory.filter((row) => row.outdated).length,
        not_scanned: inventory.filter((row) => row.last_scanned_at == null)
          .length,
      },
    };
  }

  async checkVersions(id: number) {
    const plugin = await this.findById(id);
    const latestVersion = await this.github.getLatestTag(
      plugin.repo_url,
      plugin.repo_path,
      plugin.type,
      plugin.slug,
    );
    const result = await this.repo.updateLatestVersionForInstallations(
      BigInt(id),
      latestVersion,
    );
    return {
      latest_version: latestVersion,
      updated: result.count,
    };
  }

  async updateInstalled(id: number) {
    const plugin = await this.findById(id);
    const installations = await this.repo.listInstallations(BigInt(id));
    const jobs = [];

    for (const install of installations) {
      const envId = Number(install.environment_id);
      const result = await this.jobOrchestrator.enqueue({
        queue: this.customQueue,
        queueName: QUEUES.CUSTOM_PLUGINS,
        jobType: JOB_TYPES.CUSTOM_PLUGIN_MANAGE,
        payload: {
          environmentId: envId,
          customPluginId: id,
          action: "update",
        },
        environmentId: envId,
        beforeQueueAdd: async (jobExecutionId) => {
          return {
            environmentId: envId,
            jobExecutionId,
            action: "update",
            customPluginId: id,
            slug: plugin.slug,
            repoUrl: plugin.repo_url,
            repoPath: plugin.repo_path,
            type: plugin.type,
          };
        },
      });

      jobs.push({
        environmentId: envId,
        jobExecutionId: result.jobExecutionId,
        bullJobId: result.bullJobId,
      });
    }

    return { count: jobs.length, jobs };
  }

  private findPluginInScan(scanPayload: unknown, slug: string) {
    const plugins = Array.isArray(scanPayload)
      ? scanPayload
      : Array.isArray((scanPayload as { plugins?: unknown[] } | null)?.plugins)
        ? (scanPayload as { plugins: unknown[] }).plugins
        : [];
    return plugins.find(
      (plugin) =>
        typeof plugin === "object" &&
        plugin !== null &&
        (plugin as { slug?: unknown }).slug === slug,
    ) as
      | {
          version?: string | null;
        }
      | undefined;
  }
}
