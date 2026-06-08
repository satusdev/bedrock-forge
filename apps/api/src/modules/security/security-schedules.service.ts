import { Injectable, NotFoundException } from "@nestjs/common";
import { SecurityRepository } from "./security.repository";
import type { UpsertSecurityScheduleDto } from "./dto/security-schedule.dto";
import type { SecuritySeverity } from "@prisma/client";

@Injectable()
export class SecuritySchedulesService {
  constructor(private readonly repo: SecurityRepository) {}

  async getServerSchedule(serverId: number) {
    return this.repo.findServerSchedule(BigInt(serverId));
  }

  async upsertServerSchedule(serverId: number, dto: UpsertSecurityScheduleDto) {
    const server = await this.repo.findServerById(BigInt(serverId));
    if (!server) throw new NotFoundException(`Server ${serverId} not found`);
    return this.repo.upsertServerSchedule(BigInt(serverId), {
      scan_types: dto.scan_types,
      frequency: dto.frequency,
      hour: dto.hour,
      minute: dto.minute,
      day_of_week: dto.day_of_week ?? null,
      day_of_month: dto.day_of_month ?? null,
      enabled: dto.enabled ?? true,
      notify_enabled: dto.notify_enabled ?? false,
      notify_threshold: (dto.notify_threshold ??
        "critical") as SecuritySeverity,
    });
  }

  async deleteServerSchedule(serverId: number) {
    return this.repo.deleteServerSchedule(BigInt(serverId));
  }

  async getEnvironmentSchedule(environmentId: number) {
    return this.repo.findEnvironmentSchedule(BigInt(environmentId));
  }

  async upsertEnvironmentSchedule(
    environmentId: number,
    dto: UpsertSecurityScheduleDto,
  ) {
    const env = await this.repo.findEnvironmentById(BigInt(environmentId));
    if (!env)
      throw new NotFoundException(`Environment ${environmentId} not found`);
    return this.repo.upsertEnvironmentSchedule(BigInt(environmentId), {
      scan_types: dto.scan_types,
      frequency: dto.frequency,
      hour: dto.hour,
      minute: dto.minute,
      day_of_week: dto.day_of_week ?? null,
      day_of_month: dto.day_of_month ?? null,
      enabled: dto.enabled ?? true,
      notify_enabled: dto.notify_enabled ?? false,
      notify_threshold: (dto.notify_threshold ??
        "critical") as SecuritySeverity,
    });
  }

  async deleteEnvironmentSchedule(environmentId: number) {
    return this.repo.deleteEnvironmentSchedule(BigInt(environmentId));
  }
}
