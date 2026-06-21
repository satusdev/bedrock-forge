import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { join } from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { SshKeyService } from "../../services/ssh-key.service";
import { EncryptionService } from "../../encryption/encryption.service";
import { StepTracker } from "../../services/step-tracker";
import { createRemoteExecutor } from "@bedrock-forge/remote-executor";
import {
  QUEUES,
  JOB_TYPES,
  CustomPluginManagePayload,
} from "@bedrock-forge/shared";
import { ConfigService } from "@nestjs/config";
import {
  shellQuote,
  pushRemoteScript,
  WpCliBuilder,
} from "../../utils/processor-utils";

@Processor(QUEUES.CUSTOM_PLUGINS, { concurrency: 1 })
export class CustomPluginProcessor extends WorkerHost {
  private readonly logger = new Logger(CustomPluginProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sshKey: SshKeyService,
    private readonly encryption: EncryptionService,
  ) {
    super();
  }

  async process(job: Job) {
    return this.processManage(job);
  }

  private async processManage(job: Job) {
    const payload = job.data as CustomPluginManagePayload;
    const {
      environmentId,
      jobExecutionId,
      customPluginId,
      slug,
      repoUrl,
      repoPath,
      type,
    } = payload;
    const action = payload.action as "add" | "remove" | "update";

    const tracker = await StepTracker.start(
      this.prisma,
      jobExecutionId,
      this.logger,
      job,
    );

    try {
      await tracker.track({
        step: `Custom plugin ${action} started`,
        level: "info",
        detail: `slug=${slug}, env=${environmentId}`,
      });

      const env = await this.prisma.environment.findUniqueOrThrow({
        where: { id: BigInt(environmentId) },
        include: { server: true },
      });

      await tracker.track({
        step: "Connecting to server",
        level: "info",
        detail: env.server.ip_address,
      });

      const privateKey = await this.sshKey.resolvePrivateKey(env.server);
      const executor = createRemoteExecutor({
        host: env.server.ip_address,
        port: env.server.ssh_port,
        username: env.server.ssh_user,
        privateKey,
      });

      await job.updateProgress(10);

      // Retrieve optional GitHub token from app settings (stored encrypted).
      // Falls back gracefully for legacy plaintext values pre-dating encryption.
      const tokenSetting = await this.prisma.appSetting.findUnique({
        where: { key: "GITHUB_API_TOKEN" },
      });
      let githubToken: string | null = null;
      if (tokenSetting?.value) {
        try {
          githubToken = this.encryption.decrypt(tokenSetting.value);
        } catch {
          // Legacy plaintext value (pre-encryption migration).
          githubToken = tokenSetting.value;
        }
      }

      const scriptsPath = this.config.get<string>("scriptsPath")!;
      const remoteScript = `/tmp/custom_plugin_${job.id}.php`;

      await tracker.track({
        step: "Uploading atomic GitHub extension manager",
        level: "info",
      });

      await pushRemoteScript(
        executor,
        join(scriptsPath, "github-extension-manager.php"),
        remoteScript,
      );

      await job.updateProgress(20);

      const wpPathResult = await executor.execute(
        `[ -d ${shellQuote(env.root_path + "/web/wp")} ] && echo bedrock || echo standard`,
        { timeout: 10_000 },
      );
      const wpPath =
        wpPathResult.stdout.trim() === "bedrock"
          ? `${env.root_path}/web/wp`
          : env.root_path;
      const wpCli = await WpCliBuilder.create(executor, wpPath);
      const phpCmd = wpCli.lsphpBin ? shellQuote(wpCli.lsphpBin) : "php";

      const tokenArg = githubToken
        ? ` --github-token=${shellQuote(githubToken)}`
        : "";

      const cmd = [
        `${phpCmd} ${shellQuote(remoteScript)}`,
        `--action=${action}`,
        `--docroot=${shellQuote(env.root_path)}`,
        `--slug=${shellQuote(slug)}`,
        `--repo-url=${shellQuote(repoUrl)}`,
        `--repo-path=${shellQuote(repoPath)}`,
        `--type=${shellQuote(type)}`,
        tokenArg,
      ]
        .filter(Boolean)
        .join(" ");

      await tracker.track({
        step: `Running atomic extension manager --action=${action}`,
        level: "info",
        detail: `${slug} php=${wpCli.lsphpBin ?? "php"}`,
      });

      const manageStart = Date.now();
      let manageResult;
      try {
        manageResult = await executor.execute(cmd, {
          // composer install can take a while on first run
          timeout: 10 * 60 * 1000,
        });
      } finally {
        await executor
          .execute(`rm -f ${remoteScript}`, { timeout: 5_000 })
          .catch(() => {});
      }
      await tracker.trackCommand(
        `custom-plugin ${action}`,
        cmd,
        manageResult,
        Date.now() - manageStart,
      );

      if (manageResult.code !== 0) {
        throw new Error(`atomic extension manager ${action} failed (exit ${manageResult.code}): ${manageResult.stderr}`);
      }

      // Parse output to confirm success
      let output: { success: boolean; error?: string } = { success: true };
      try {
        output = JSON.parse(manageResult.stdout);
      } catch {
        // best-effort parse; non-zero exit already handled above
      }
      if (!output.success) {
        throw new Error(
          output.error ?? `atomic extension manager ${action} reported failure`,
        );
      }

      if (
        (action === "add" || action === "update") &&
        slug === "wp-secure-guard"
      ) {
        await this.syncWpSecureTrustedIps(executor, wpCli, tracker);
      }

      await job.updateProgress(70);

      // Update EnvironmentCustomPlugin junction table
      if (action === "add" || action === "update") {
        // Fetch latest GitHub tag to record as installed_version
        let installedVersion: string | null = null;
        try {
          const tagRes = await fetch(
            `https://api.github.com/repos/${this.parseOwnerRepo(repoUrl)}/releases/latest`,
            {
              headers: {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "bedrock-forge",
                ...(githubToken
                  ? { Authorization: `Bearer ${githubToken}` }
                  : {}),
              },
            },
          );
          if (tagRes.ok) {
            const data = (await tagRes.json()) as { tag_name?: string };
            installedVersion = data.tag_name ?? null;
          }
        } catch {
          // non-fatal: version tracking is best-effort
        }

        await this.prisma.environmentCustomPlugin.upsert({
          where: {
            environment_id_custom_plugin_id: {
              environment_id: BigInt(environmentId),
              custom_plugin_id: BigInt(customPluginId),
            },
          },
          update: {
            installed_version: installedVersion,
          },
          create: {
            environment_id: BigInt(environmentId),
            custom_plugin_id: BigInt(customPluginId),
            installed_version: installedVersion,
          },
        });
      } else if (action === "remove") {
        await this.prisma.environmentCustomPlugin
          .delete({
            where: {
              environment_id_custom_plugin_id: {
                environment_id: BigInt(environmentId),
                custom_plugin_id: BigInt(customPluginId),
              },
            },
          })
          .catch(() => {
            // already deleted or never existed — safe to ignore
          });
      }

      // Trigger a fresh plugin scan to update the stored plugin list
      await tracker.track({
        step: "Triggering fresh plugin scan",
        level: "info",
      });
      const { randomUUID } = await import("crypto");
      const scanBullJobId = randomUUID();
      const scanExec = await this.prisma.jobExecution.create({
        data: {
          environment_id: BigInt(environmentId),
          queue_name: QUEUES.PLUGIN_SCANS,
          job_type: JOB_TYPES.PLUGIN_SCAN_RUN,
          bull_job_id: scanBullJobId,
        },
      });
      const { Queue } = await import("bullmq");
      const redisUrl = this.config.get<string>("redis.url")!;
      const scanQueue = new Queue(QUEUES.PLUGIN_SCANS, {
        connection: { url: redisUrl },
      });
      await scanQueue.add(
        JOB_TYPES.PLUGIN_SCAN_RUN,
        { environmentId, jobExecutionId: Number(scanExec.id) },
        { jobId: scanBullJobId },
      );
      await scanQueue.close();

      await job.updateProgress(100);

      await tracker.track({
        step: `Custom plugin ${action} complete`,
        level: "info",
      });

      await tracker.complete();

      this.logger.log(`[${job.id}] Custom plugin ${action} complete: ${slug}`);
    } catch (err: unknown) {
      this.logger.error(
        `Custom plugin ${action} job ${job.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await tracker.fail(err, `custom plugin ${action}`);
      throw err;
    }
  }

  private async syncWpSecureTrustedIps(
    executor: ReturnType<typeof createRemoteExecutor>,
    wpCli: WpCliBuilder,
    tracker: StepTracker,
  ): Promise<void> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: "security_ip_allowlist" },
    });
    const trustedCidrs = this.parseTrustedCidrs(setting?.value);
    if (trustedCidrs.length === 0) return;

    await tracker.track({
      step: "Syncing Forge trusted IPs to WP Secure",
      level: "info",
      detail: `${trustedCidrs.length} trusted IP/CIDR entries`,
    });

    const getCommand = wpCli.buildCommand(
      "option get secure_guard_settings --format=json --skip-themes",
    );
    const current = await executor.execute(getCommand, { timeout: 30_000 });
    let settings: Record<string, unknown> = {};
    if (current.code === 0 && current.stdout.trim() !== "") {
      try {
        const parsed = JSON.parse(current.stdout.trim()) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          settings = parsed as Record<string, unknown>;
        }
      } catch {
        await tracker.track({
          step: "WP Secure settings were not valid JSON; rebuilding safely",
          level: "warn",
        });
      }
    }

    const existing = String(settings.ip_whitelist ?? "")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    settings.ip_whitelist = [...new Set([...existing, ...trustedCidrs])].join(
      "\n",
    );

    const updateCommand = wpCli.buildCommand(
      `option update secure_guard_settings ${shellQuote(JSON.stringify(settings))} --format=json --skip-themes`,
    );
    const updated = await executor.execute(updateCommand, { timeout: 30_000 });
    if (updated.code !== 0) {
      throw new Error(
        `Failed to sync WP Secure trusted IPs: ${updated.stderr || updated.stdout}`,
      );
    }
    await tracker.track({
      step: "WP Secure trusted IPs synchronized",
      level: "info",
      detail: `${trustedCidrs.length} Forge entries merged`,
    });
  }

  private parseTrustedCidrs(value: string | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (entry): entry is string =>
          typeof entry === "string" &&
          /^[0-9a-fA-F:.]+(?:\/\d{1,3})?$/.test(entry),
      );
    } catch {
      return [];
    }
  }

  /** Extract "owner/repo" from a GitHub URL for the Releases API. */
  private parseOwnerRepo(repoUrl: string): string {
    const sshMatch = repoUrl.match(
      /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/,
    );
    if (sshMatch) return sshMatch[1];
    const httpsMatch = repoUrl.match(
      /^https:\/\/github\.com\/([^/]+\/[^/.]+?)(?:\.git)?$/,
    );
    if (httpsMatch) return httpsMatch[1];
    return "";
  }
}
