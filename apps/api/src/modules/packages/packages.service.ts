import { Injectable, NotFoundException } from '@nestjs/common';
import { PackagesRepository } from './packages.repository';
import {
	CreateHostingPackageDto,
	UpdateHostingPackageDto,
	CreateSupportPackageDto,
	UpdateSupportPackageDto,
} from './dto/package.dto';

@Injectable()
export class PackagesService {
	constructor(private readonly repo: PackagesRepository) {}

	/* ── Hosting ─────────────────────────────────────────────────────────── */

	findAllHosting() {
		return this.repo.findAllHosting();
	}

	async findOneHosting(id: number) {
		const pkg = await this.repo.findOneHosting(id);
		if (!pkg) throw new NotFoundException(`Hosting package ${id} not found`);
		return pkg;
	}

	createHosting(dto: CreateHostingPackageDto) {
		return this.repo.createHosting(dto);
	}

	async updateHosting(id: number, dto: UpdateHostingPackageDto) {
		await this.findOneHosting(id);
		return this.repo.updateHosting(id, dto);
	}

	async removeHosting(id: number) {
		await this.findOneHosting(id);
		return this.repo.removeHosting(id);
	}

	/* ── Support ─────────────────────────────────────────────────────────── */

	findAllSupport() {
		return this.repo.findAllSupport();
	}

	async findOneSupport(id: number) {
		const pkg = await this.repo.findOneSupport(id);
		if (!pkg) throw new NotFoundException(`Support package ${id} not found`);
		return pkg;
	}

	createSupport(dto: CreateSupportPackageDto) {
		return this.repo.createSupport(dto);
	}

	async updateSupport(id: number, dto: UpdateSupportPackageDto) {
		await this.findOneSupport(id);
		return this.repo.updateSupport(id, dto);
	}

	async removeSupport(id: number) {
		await this.findOneSupport(id);
		return this.repo.removeSupport(id);
	}
}
