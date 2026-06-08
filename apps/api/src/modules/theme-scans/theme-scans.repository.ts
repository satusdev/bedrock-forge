import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { JOB_TYPES, QUEUES, type PaginationQuery } from "@bedrock-forge/shared";

@Injectable()
export class ThemeScansRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEnvironment(envId: bigint, query: PaginationQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.prisma
      .$transaction([
        this.prisma.themeScan.findMany({
          where: { environment_id: envId },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { scanned_at: "desc" },
        }),
        this.prisma.themeScan.count({ where: { environment_id: envId } }),
        this.prisma.jobExecution.findFirst({
          where: {
            environment_id: envId,
            queue_name: QUEUES.THEME_SCANS,
            job_type: JOB_TYPES.THEME_SCAN_RUN,
          },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            status: true,
            progress: true,
            started_at: true,
            completed_at: true,
            last_error: true,
            created_at: true,
          },
        }),
      ])
      .then(([items, total, latestExecution]) => ({
        items,
        total,
        page,
        limit,
        latestExecution,
      }));
  }

  createJobExecution(data: {
    environment_id: bigint;
    queue_name: string;
    job_type?: string;
    bull_job_id: string;
  }) {
    return this.prisma.jobExecution.create({ data });
  }

  findJobExecution(execId: bigint) {
    return this.prisma.jobExecution.findUnique({
      where: { id: execId },
      select: {
        id: true,
        status: true,
        progress: true,
        execution_log: true,
        completed_at: true,
        last_error: true,
      },
    });
  }

  findEnvironment(envId: bigint) {
    return this.prisma.environment.findUnique({
      where: { id: envId },
      select: { id: true, root_path: true },
    });
  }
}
