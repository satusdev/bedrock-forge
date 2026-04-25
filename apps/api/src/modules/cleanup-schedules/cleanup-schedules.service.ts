import { Injectable, NotFoundException } from '@nestjs/common';
import {
	CleanupSchedulesRepository,
	UpsertCleanupScheduleData,
} from './cleanup-schedules.repository';

@Injectable()
export class CleanupSchedulesService {
	constructor(private readonly repo: CleanupSchedulesRepository) {}

	async findByEnvironment(envId: number) {
		return this.repo.findByEnvironment(BigInt(envId));
	}

	async upsert(envId: number, data: UpsertCleanupScheduleData) {
		return this.repo.upsert(BigInt(envId), data);
	}

	async delete(envId: number) {
		const existing = await this.repo.findByEnvironment(BigInt(envId));
		if (!existing)
			throw new NotFoundException(
				`No cleanup schedule for environment ${envId}`,
			);
		return this.repo.delete(BigInt(envId));
	}
}
