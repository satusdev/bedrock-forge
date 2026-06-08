import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { JobExecutionsRepository } from "./job-executions.repository";
import { randomUUID } from "crypto";
import { DEFAULT_JOB_OPTIONS } from "@bedrock-forge/shared";

export interface EnqueueOptions<PayloadType = any> {
  queue: Queue;
  queueName: string;
  jobType: string;
  payload: PayloadType;
  serverId?: bigint | number;
  environmentId?: bigint | number;
  jobId?: string;
  jobOptions?: any;
  beforeQueueAdd?: (jobExecutionId: number) => Promise<any>;
  onFailure?: (jobExecutionId: number, error: string) => Promise<void>;
}

@Injectable()
export class JobOrchestratorService {
  private readonly logger = new Logger(JobOrchestratorService.name);

  constructor(private readonly repo: JobExecutionsRepository) {}

  async enqueue<PayloadType = any>({
    queue,
    queueName,
    jobType,
    payload,
    serverId,
    environmentId,
    jobId,
    jobOptions = DEFAULT_JOB_OPTIONS,
    beforeQueueAdd,
    onFailure,
  }: EnqueueOptions<PayloadType>) {
    const bullJobId = jobId || randomUUID();

    // Create JobExecution record
    const exec = await this.repo.create({
      queue_name: queueName,
      bull_job_id: bullJobId,
      job_type: jobType,
      status: "queued",
      server_id: serverId ? BigInt(serverId) : null,
      environment_id: environmentId ? BigInt(environmentId) : null,
      payload: (payload || {}) as any,
    });

    const jobExecutionId = Number(exec.id);

    try {
      // Resolve the exact payload/job data to send to the queue
      const jobData = beforeQueueAdd
        ? await beforeQueueAdd(jobExecutionId)
        : { ...payload, jobExecutionId };

      const job = await queue.add(jobType, jobData, {
        ...jobOptions,
        jobId: bullJobId,
      });

      return { jobExecutionId, jobId: job.id, bullJobId };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to enqueue job ${jobType} for execution ${jobExecutionId}: ${errMsg}`,
      );

      if (onFailure) {
        try {
          await onFailure(jobExecutionId, errMsg);
        } catch (failHookErr) {
          this.logger.error(
            `onFailure hook failed for job ${jobType} execution ${jobExecutionId}: ${
              failHookErr instanceof Error
                ? failHookErr.message
                : String(failHookErr)
            }`,
          );
        }
      }

      await this.repo.updateStatus(exec.id, "failed", errMsg);

      throw err;
    }
  }
}
