import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
	CreateHostingPackageDto,
	UpdateHostingPackageDto,
	CreateSupportPackageDto,
	UpdateSupportPackageDto,
} from './dto/package.dto';

@Injectable()
export class PackagesService {
	constructor(private readonly prisma: PrismaService) {}

	/* Hosting */
	findAllHosting() {
		return this.prisma.hostingPackage.findMany({ orderBy: { name: 'asc' } });
	}
	async findOneHosting(id: number) {
		const p = await this.prisma.hostingPackage.findUnique({
			where: { id: BigInt(id) },
		});
		if (!p) throw new NotFoundException(`Hosting package ${id} not found`);
		return p;
	}
	createHosting(dto: CreateHostingPackageDto) {
		return this.prisma.hostingPackage.create({ data: dto });
	}
	async updateHosting(id: number, dto: UpdateHostingPackageDto) {
		await this.findOneHosting(id);
		return this.prisma.hostingPackage.update({
			where: { id: BigInt(id) },
			data: dto,
		});
	}
	async removeHosting(id: number) {
		await this.findOneHosting(id);
		return this.prisma.hostingPackage.delete({ where: { id: BigInt(id) } });
	}

	/* Support */
	findAllSupport() {
		return this.prisma.supportPackage.findMany({ orderBy: { name: 'asc' } });
	}
	async findOneSupport(id: number) {
		const p = await this.prisma.supportPackage.findUnique({
			where: { id: BigInt(id) },
		});
		if (!p) throw new NotFoundException(`Support package ${id} not found`);
		return p;
	}
	createSupport(dto: CreateSupportPackageDto) {
		return this.prisma.supportPackage.create({ data: dto });
	}
	async updateSupport(id: number, dto: UpdateSupportPackageDto) {
		await this.findOneSupport(id);
		return this.prisma.supportPackage.update({
			where: { id: BigInt(id) },
			data: dto,
		});
	}
	async removeSupport(id: number) {
		await this.findOneSupport(id);
		return this.prisma.supportPackage.delete({ where: { id: BigInt(id) } });
	}
}
