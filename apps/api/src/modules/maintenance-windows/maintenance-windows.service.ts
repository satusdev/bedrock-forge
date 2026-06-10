import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { MaintenanceWindowsRepository } from "./maintenance-windows.repository";
import { CreateMaintenanceWindowDto, QueryMaintenanceWindowsDto } from "./dto/maintenance-window.dto";

@Injectable()
export class MaintenanceWindowsService {
  constructor(private readonly repo: MaintenanceWindowsRepository) {}

  async findAll(query: QueryMaintenanceWindowsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return this.repo.findAll({
      resource_type: query.resource_type,
      resource_id: query.resource_id,
      page,
      limit,
    });
  }

  async findById(id: number) {
    const window = await this.repo.findById(id);
    if (!window) {
      throw new NotFoundException(`Maintenance window with ID ${id} not found`);
    }
    return window;
  }

  async create(dto: CreateMaintenanceWindowDto, userId?: number) {
    const startsAt = new Date(dto.starts_at);
    const endsAt = new Date(dto.ends_at);

    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      throw new BadRequestException("Invalid date format");
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException("Maintenance window end time must be after start time");
    }

    return this.repo.create({
      resource_type: dto.resource_type,
      resource_id: dto.resource_id,
      reason: dto.reason,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by_id: userId,
    });
  }

  async delete(id: number) {
    await this.findById(id);
    return this.repo.delete(id);
  }

  async isServerUnderMaintenance(serverId: number): Promise<boolean> {
    return this.repo.isServerUnderMaintenance(serverId);
  }

  async isEnvironmentUnderMaintenance(environmentId: number): Promise<boolean> {
    return this.repo.isEnvironmentUnderMaintenance(environmentId);
  }
}
