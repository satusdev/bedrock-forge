import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

	findInventoryData(customPluginId: bigint) {
		return this.prisma.environment.findMany({
			orderBy: { created_at: 'asc' },
			select: {
				id: true,
				type: true,
				url: true,
				project: {
					select: {
						id: true,
						name: true,
						client: { select: { id: true, name: true } },
					},
				},
				server: { select: { id: true, name: true, ip_address: true } },
				custom_plugins: {
					where: { custom_plugin_id: customPluginId },
					include: { custom_plugin: true },
				},
				plugin_scans: {
					orderBy: { scanned_at: 'desc' },
					take: 1,
					select: { id: true, plugins: true, scanned_at: true },
				},
			},
		});
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

	listInstallations(id: bigint) {
		return this.prisma.environmentCustomPlugin.findMany({
			where: { custom_plugin_id: id },
			include: { custom_plugin: true, environment: true },
			orderBy: { created_at: 'asc' },
		});
	}

	updateLatestVersionForInstallations(
		id: bigint,
		latestVersion: string | null,
	) {
		return this.prisma.environmentCustomPlugin.updateMany({
			where: { custom_plugin_id: id },
			data: {
				latest_version: latestVersion,
				version_checked_at: new Date(),
			},
		});
	}

	createJobExecution(data: {
		environment_id: bigint;
		queue_name: string;
		job_type?: string;
		bull_job_id: string;
		payload?: Prisma.InputJsonObject;
	}) {
		return this.prisma.jobExecution.create({ data });
	}
}
