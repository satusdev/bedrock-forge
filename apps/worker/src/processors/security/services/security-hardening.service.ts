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

      const privateKey = await this.sshKey.resolvePrivateKey(server);
      const executor = createRemoteExecutor({
        host: server.ip_address,
        port: server.ssh_port,
        username: server.ssh_user,
        privateKey,
      });

      const results = await applyServerHardeningActions(executor, actions);

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

      const privateKey = await this.sshKey.resolvePrivateKey(env.server);
      const executor = createRemoteExecutor({
        host: env.server.ip_address,
        port: env.server.ssh_port,
        username: env.server.ssh_user,
        privateKey,
      });

      const rootPath = env.root_path;
      const results = await applyEnvironmentHardeningActions(
        executor,
        rootPath,
        actions,
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
}
