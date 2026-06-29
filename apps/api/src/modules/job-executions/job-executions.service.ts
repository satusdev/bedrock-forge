import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { JobExecutionStatus } from "@prisma/client";
import { ModuleRef } from "@nestjs/core";
import { getQueueToken } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  JobExecutionsRepository,
  JobExecutionFilter,
} from "./job-executions.repository";
import { JobOrchestratorService } from "./job-orchestrator.service";

@Injectable()
export class JobExecutionsService {
  constructor(
    private readonly repo: JobExecutionsRepository,
    private readonly orchestrator: JobOrchestratorService,
    private readonly moduleRef: ModuleRef,
  ) {}

  list(filter: JobExecutionFilter, page: number, limit: number) {
    return this.repo.findPaginated(filter, page, limit);
  }

  findOne(id: number) {
    return this.repo.findById(id);
  }

  findLog(id: number) {
    return this.repo.findLog(id);
  }

  findEnvIdByBullJobId(bullJobId: string, queueName?: string) {
    return this.repo.findEnvIdByBullJobId(bullJobId, queueName);
  }

  updateStatusByBullJobId(
    bullJobId: string,
    queueName: string,
    status: JobExecutionStatus,
    error?: string,
  ) {
    return this.repo.updateStatusByBullJobId(bullJobId, queueName, status, error);
  }

  async retry(id: number) {
    const jobExec = await this.repo.findById(id);
    if (!jobExec) {
      throw new NotFoundException(`Job execution ${id} not found`);
    }

    let queue: Queue;
    try {
      const token = getQueueToken(jobExec.queue_name);
      queue = this.moduleRef.get<Queue>(token, { strict: false });
    } catch (err) {
      throw new BadRequestException(
        `Failed to resolve queue for name: ${jobExec.queue_name}`,
      );
    }

    if (!queue) {
      throw new BadRequestException(
        `Queue ${jobExec.queue_name} not available in system`,
      );
    }

    if (!jobExec.job_type) {
      throw new BadRequestException(`Cannot retry a job execution with no job type`);
    }

    return this.orchestrator.enqueue({
      queue,
      queueName: jobExec.queue_name,
      jobType: jobExec.job_type,
      payload: jobExec.payload,
      serverId: jobExec.server_id ? Number(jobExec.server_id) : undefined,
      environmentId: jobExec.environment_id ? Number(jobExec.environment_id) : undefined,
    });
  }

  async discard(id: number) {
    const jobExec = await this.repo.findById(id);
    if (!jobExec) {
      throw new NotFoundException(`Job execution ${id} not found`);
    }

    return this.repo.updateStatus(
      BigInt(id),
      "failed",
      "Discarded by operator",
    );
  }
}
