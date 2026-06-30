import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../../../prisma/prisma.service";
import { SshKeyService } from "../../../services/ssh-key.service";
import { createRemoteExecutor } from "@bedrock-forge/remote-executor";
import type {
  SecurityServerHardeningPayload,
  SecurityEnvironmentHardeningPayload,
} from "@bedrock-forge/shared";
import {
  applyServerHardeningActions,
  applyEnvironmentHardeningActions,
} from "../hardening-actions";
import { StepTracker } from "../../../services/step-tracker";

@Injectable()
export class SecurityHardeningService {
  private readonly logger = new Logger(SecurityHardeningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sshKey: SshKeyService,
  ) {}

  async processServerHardening(job: Job) {
    const payload = job.data as SecurityServerHardeningPayload;
    const { serverId, jobExecutionId, actions } = payload;

    const tracker = await StepTracker.start(
      this.prisma,
      jobExecutionId,
      this.logger,
      job,
    );

    try {
      const server = await this.prisma.server.findUnique({
        where: { id: BigInt(serverId) },
      });
      if (!server) throw new Error(`Server ${serverId} not found`);

      const executor = createRemoteExecutor(
        await this.sshKey.getSshConfig(server),
      );

      const allowlistSetting = await this.prisma.appSetting.findUnique({
        where: { key: "security_ip_allowlist" },
      });
      let trustedCidrs: string[] = [];
      try {
        const parsed = JSON.parse(allowlistSetting?.value ?? "[]");
        if (Array.isArray(parsed)) trustedCidrs = parsed.filter((value): value is string => typeof value === "string");
      } catch {
        trustedCidrs = [];
      }

      let malwareFiles: string[] = [];
      if (actions.includes("QUARANTINE_MALWARE")) {
        malwareFiles = await this.getMalwareFilesForServer(serverId);
      }

      const results = await applyServerHardeningActions(executor, actions, trustedCidrs, malwareFiles);

      const logEntries = results.map((r) => ({
        ts: new Date().toISOString(),
        step: r.action,
        level:
          r.status === "failed"
            ? "error"
            : r.status === "skipped"
              ? "warn"
              : "info",
        detail: r.detail,
        hardenStatus: r.status,
      }));

      await tracker.complete({ executionLog: logEntries });

      this.logger.log(
        `Server hardening ${jobExecutionId} completed — ${results.length} action(s)`,
      );
      return results;
    } catch (err) {
      this.logger.error(
        `Server hardening ${jobExecutionId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await tracker.fail(err, "Server hardening");
      throw err;
    }
  }

  async processEnvironmentHardening(job: Job) {
    const payload = job.data as SecurityEnvironmentHardeningPayload;
    const { environmentId, jobExecutionId, actions } = payload;

    const tracker = await StepTracker.start(
      this.prisma,
      jobExecutionId,
      this.logger,
      job,
    );

    try {
      const env = await this.prisma.environment.findUnique({
        where: { id: BigInt(environmentId) },
        include: { server: true },
      });
      if (!env) throw new Error(`Environment ${environmentId} not found`);

      const executor = createRemoteExecutor(
        await this.sshKey.getSshConfig(env.server),
      );

      const rootPath = env.root_path;

      let malwareFiles: string[] = [];
      if (actions.includes("QUARANTINE_MALWARE")) {
        malwareFiles = await this.getMalwareFilesForEnvironment(environmentId);
      }

      const results = await applyEnvironmentHardeningActions(
        executor,
        rootPath,
        actions,
        malwareFiles,
      );

      const logEntries = results.map((r) => ({
        ts: new Date().toISOString(),
        step: r.action,
        level:
          r.status === "failed"
            ? "error"
            : r.status === "skipped"
              ? "warn"
              : "info",
        detail: r.detail,
        hardenStatus: r.status,
      }));

      await tracker.complete({ executionLog: logEntries });

      this.logger.log(
        `Environment hardening ${jobExecutionId} completed — ${results.length} action(s)`,
      );
      return results;
    } catch (err) {
      this.logger.error(
        `Environment hardening ${jobExecutionId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await tracker.fail(err, "Environment hardening");
      throw err;
    }
  }

  private async getMalwareFilesForServer(serverId: number): Promise<string[]> {
    const latestScan = await this.prisma.securityScan.findFirst({
      where: {
        server_id: BigInt(serverId),
        scan_type: "MALWARE_SCAN",
        status: "completed",
      },
      orderBy: { completed_at: "desc" },
    });
    if (!latestScan || !latestScan.findings) return [];
    const findings = latestScan.findings as any[];
    const files = new Set<string>();
    for (const f of findings) {
      if (f.category === "MALWARE" || f.category === "SUSPICIOUS_FILES") {
        const meta = f.metadata || {};
        const matched = meta.matched_files || meta.files || meta.infected_files || [];
        if (Array.isArray(matched)) {
          for (const file of matched) {
            if (typeof file === "string") files.add(file);
          }
        }
      }
    }
    return Array.from(files);
  }

  private async getMalwareFilesForEnvironment(environmentId: number): Promise<string[]> {
    const latestScan = await this.prisma.securityScan.findFirst({
      where: {
        environment_id: BigInt(environmentId),
        scan_type: "PROJECT_MALWARE",
        status: "completed",
      },
      orderBy: { completed_at: "desc" },
    });
    if (!latestScan || !latestScan.findings) return [];
    const findings = latestScan.findings as any[];
    const files = new Set<string>();
    for (const f of findings) {
      if (f.category === "MALWARE" || f.category === "SUSPICIOUS_FILES") {
        const meta = f.metadata || {};
        const matched = meta.matched_files || meta.files || meta.infected_files || [];
        if (Array.isArray(matched)) {
          for (const file of matched) {
            if (typeof file === "string") files.add(file);
          }
        }
      }
    }
    return Array.from(files);
  }
}
