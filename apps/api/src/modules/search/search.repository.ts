import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  findClients(q: string, take: number) {
    return this.prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      take,
      select: { id: true, name: true, email: true },
    });
  }

  findProjects(q: string, take: number) {
    const where: Prisma.ProjectWhereInput = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { client: { name: { contains: q, mode: "insensitive" } } },
        {
          environments: { some: { url: { contains: q, mode: "insensitive" } } },
        },
      ],
    };

    return this.prisma.project.findMany({
      where,
      orderBy: { name: "asc" },
      take,
      select: {
        id: true,
        name: true,
        client: { select: { name: true } },
        _count: { select: { environments: true } },
      },
    });
  }

  findEnvironments(q: string, take: number) {
    return this.prisma.environment.findMany({
      where: {
        OR: [
          { type: { contains: q, mode: "insensitive" } },
          { url: { contains: q, mode: "insensitive" } },
          { root_path: { contains: q, mode: "insensitive" } },
          { project: { name: { contains: q, mode: "insensitive" } } },
          { server: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      orderBy: [{ project: { name: "asc" } }, { type: "asc" }],
      take,
      select: {
        id: true,
        type: true,
        url: true,
        project: { select: { id: true, name: true } },
        server: { select: { name: true } },
      },
    });
  }

  findServers(q: string, take: number) {
    return this.prisma.server.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { ip_address: { contains: q, mode: "insensitive" } },
          { provider: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      take,
      select: { id: true, name: true, ip_address: true, provider: true },
    });
  }

  findDomains(q: string, take: number) {
    return this.prisma.domain.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take,
      select: { id: true, name: true, expires_at: true },
    });
  }

  findMonitors(q: string, take: number) {
    return this.prisma.monitor.findMany({
      where: {
        OR: [
          { environment: { url: { contains: q, mode: "insensitive" } } },
          { environment: { type: { contains: q, mode: "insensitive" } } },
          {
            environment: {
              project: { name: { contains: q, mode: "insensitive" } },
            },
          },
        ],
      },
      orderBy: { created_at: "desc" },
      take,
      select: {
        id: true,
        enabled: true,
        last_status: true,
        environment: {
          select: {
            id: true,
            type: true,
            url: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  findJobs(q: string, take: number) {
    const numericId = /^\d+$/.test(q) ? BigInt(q) : undefined;

    return this.prisma.jobExecution.findMany({
      where: q
        ? {
            OR: [
              ...(numericId ? [{ id: numericId }] : []),
              { queue_name: { contains: q, mode: "insensitive" } },
              { job_type: { contains: q, mode: "insensitive" } },
              {
                environment: {
                  project: { name: { contains: q, mode: "insensitive" } },
                },
              },
              { environment: { url: { contains: q, mode: "insensitive" } } },
              { server: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : undefined,
      orderBy: { created_at: "desc" },
      take,
      select: {
        id: true,
        queue_name: true,
        job_type: true,
        status: true,
        environment: {
          select: {
            id: true,
            type: true,
            url: true,
            project: { select: { id: true, name: true } },
          },
        },
        server: { select: { id: true, name: true } },
      },
    });
  }

  findLatestSecurityScansWithFindings(take: number) {
    return this.prisma.securityScan.findMany({
      where: {
        status: "completed",
        findings: { not: Prisma.JsonNull },
      },
      orderBy: { completed_at: "desc" },
      take,
      select: {
        id: true,
        scan_type: true,
        findings: true,
        server: { select: { id: true, name: true } },
        environment: {
          select: {
            id: true,
            type: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });
  }
}
