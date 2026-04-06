import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
	CreateHostingPackageDto,
	UpdateHostingPackageDto,
	CreateSupportPackageDto,
	UpdateSupportPackageDto,
} from './dto/package.dto';

@Injectable()
export class PackagesRepository {
	constructor(private readonly prisma: PrismaService) {}

	/* ── Hosting ─────────────────────────────────────────────────────────── */

	findAllHosting() {
		return this.prisma.hostingPackage.findMany({ orderBy: { name: 'asc' } });
	}

	findOneHosting(id: number) {
		return this.prisma.hostingPackage.findUnique({ where: { id: BigInt(id) } });
	}

	createHosting(dto: CreateHostingPackageDto) {
		return this.prisma.hostingPackage.create({ data: dto });
	}

	updateHosting(id: number, dto: UpdateHostingPackageDto) {
		return this.prisma.hostingPackage.update({
			where: { id: BigInt(id) },
			data: dto,
		});
	}

	removeHosting(id: number) {
		return this.prisma.hostingPackage.delete({ where: { id: BigInt(id) } });
	}

	/* ── Support ─────────────────────────────────────────────────────────── */

	findAllSupport() {
		return this.prisma.supportPackage.findMany({ orderBy: { name: 'asc' } });
	}

	findOneSupport(id: number) {
		return this.prisma.supportPackage.findUnique({ where: { id: BigInt(id) } });
	}

	createSupport(dto: CreateSupportPackageDto) {
		return this.prisma.supportPackage.create({ data: dto });
	}

	updateSupport(id: number, dto: UpdateSupportPackageDto) {
		return this.prisma.supportPackage.update({
			where: { id: BigInt(id) },
			data: dto,
		});
	}

	removeSupport(id: number) {
		return this.prisma.supportPackage.delete({ where: { id: BigInt(id) } });
	}
}
