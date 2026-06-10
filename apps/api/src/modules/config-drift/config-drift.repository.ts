import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ConfigDriftRepository {
  constructor(private readonly prisma: PrismaService) {}

  getProjectEnvironmentsWithScans(projectId: bigint) {
    return this.prisma.environment.findMany({
      where: { project_id: projectId },
      include: {
        server: { select: { id: true, name: true } },
        plugin_scans: {
          orderBy: { scanned_at: "desc" },
          take: 1,
        },
      },
      orderBy: { created_at: "asc" },
    });
  }

  /** Return all distinct project IDs that have at least one baseline environment. */
  async findProjectIdsWithBaseline(): Promise<bigint[]> {
    const envs = await this.prisma.environment.findMany({
      where: { is_baseline: true },
      select: { project_id: true },
      distinct: ["project_id"],
    });
    return envs.map((e) => e.project_id);
  }

  async setBaseline(projectId: bigint, envId: bigint) {
    await this.prisma.$transaction([
      this.prisma.environment.updateMany({
        where: { project_id: projectId },
        data: { is_baseline: false },
      }),
      this.prisma.environment.update({
        where: { id: envId },
        data: { is_baseline: true },
      }),
    ]);
  }

  clearBaseline(projectId: bigint) {
    return this.prisma.environment.updateMany({
      where: { project_id: projectId },
      data: { is_baseline: false },
    });
  }
}
