import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaginationQuery } from '@bedrock-forge/shared';

@Injectable()
export class PluginScansRepository {
	constructor(private readonly prisma: PrismaService) {}

	findByEnvironment(envId: bigint, query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		return this.prisma
			.$transaction([
				this.prisma.pluginScan.findMany({
					where: { environment_id: envId },
					skip: (page - 1) * limit,
					take: limit,
					orderBy: { scanned_at: 'desc' },
				}),
				this.prisma.pluginScan.count({ where: { environment_id: envId } }),
			])
			.then(([items, total]) => ({ items, total, page, limit }));
	}

	createJobExecution(data: {
		environment_id: bigint;
		queue_name: string;
		job_type?: string;
		bull_job_id: string;
	}) {
		return this.prisma.jobExecution.create({ data });
	}

	findJobExecution(execId: bigint) {
		return this.prisma.jobExecution.findUnique({
			where: { id: execId },
			select: {
				id: true,
				status: true,
				progress: true,
				execution_log: true,
				completed_at: true,
				last_error: true,
			},
		});
	}

	// ─── EnvironmentCustomPlugin CRUD ─────────────────────────────────────────

	listEnvironmentCustomPlugins(envId: bigint) {
		return this.prisma.environmentCustomPlugin.findMany({
			where: { environment_id: envId },
			include: { custom_plugin: true },
			orderBy: { created_at: 'asc' },
		});
	}

	findCustomPlugin(id: bigint) {
		return this.prisma.customPlugin.findUnique({ where: { id } });
	}

	upsertEnvironmentCustomPlugin(
		environmentId: bigint,
		customPluginId: bigint,
		data: {
			installed_version?: string | null;
			latest_version?: string | null;
			version_checked_at?: Date | null;
		},
	) {
		return this.prisma.environmentCustomPlugin.upsert({
			where: {
				environment_id_custom_plugin_id: {
					environment_id: environmentId,
					custom_plugin_id: customPluginId,
				},
			},
			update: data,
			create: {
				environment_id: environmentId,
				custom_plugin_id: customPluginId,
				...data,
			},
		});
	}

	updateEnvironmentCustomPlugin(
		environmentId: bigint,
		customPluginId: bigint,
		data: {
			installed_version?: string | null;
			latest_version?: string | null;
			version_checked_at?: Date | null;
		},
	) {
		return this.prisma.environmentCustomPlugin.update({
			where: {
				environment_id_custom_plugin_id: {
					environment_id: environmentId,
					custom_plugin_id: customPluginId,
				},
			},
			data,
		});
	}

	deleteEnvironmentCustomPlugin(environmentId: bigint, customPluginId: bigint) {
		return this.prisma.environmentCustomPlugin.delete({
			where: {
				environment_id_custom_plugin_id: {
					environment_id: environmentId,
					custom_plugin_id: customPluginId,
				},
			},
		});
	}
}
