import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomPluginDto } from './dto/create-custom-plugin.dto';
import { UpdateCustomPluginDto } from './dto/update-custom-plugin.dto';

@Injectable()
export class CustomPluginsRepository {
	constructor(private readonly prisma: PrismaService) {}

	findAll() {
		return this.prisma.customPlugin.findMany({
			orderBy: { name: 'asc' },
			include: {
				_count: { select: { environment_plugins: true } },
			},
		});
	}

	findById(id: bigint) {
		return this.prisma.customPlugin.findUnique({ where: { id } });
	}

	create(dto: CreateCustomPluginDto) {
		return this.prisma.customPlugin.create({
			data: {
				name: dto.name,
				slug: dto.slug,
				description: dto.description,
				repo_url: dto.repo_url,
				repo_path: dto.repo_path ?? '.',
				type: dto.type ?? 'plugin',
			},
		});
	}

	update(id: bigint, dto: UpdateCustomPluginDto) {
		return this.prisma.customPlugin.update({
			where: { id },
			data: {
				...(dto.name !== undefined && { name: dto.name }),
				...(dto.slug !== undefined && { slug: dto.slug }),
				...(dto.description !== undefined && { description: dto.description }),
				...(dto.repo_url !== undefined && { repo_url: dto.repo_url }),
				...(dto.repo_path !== undefined && { repo_path: dto.repo_path }),
				...(dto.type !== undefined && { type: dto.type }),
			},
		});
	}

	delete(id: bigint) {
		return this.prisma.customPlugin.delete({ where: { id } });
	}

	countInstallations(id: bigint) {
		return this.prisma.environmentCustomPlugin.count({
			where: { custom_plugin_id: id },
		});
	}
}
