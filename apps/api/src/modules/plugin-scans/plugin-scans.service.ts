import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
	QUEUES,
	JOB_TYPES,
	DEFAULT_JOB_OPTIONS,
	PaginationQuery,
} from '@bedrock-forge/shared';

@Injectable()
export class PluginScansService {
	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.PLUGIN_SCANS) private readonly queue: Queue,
	) {}

	findByEnvironment(envId: number, query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		return this.prisma
			.$transaction([
				this.prisma.pluginScan.findMany({
					where: { environment_id: BigInt(envId) },
					skip: (page - 1) * limit,
					take: limit,
					orderBy: { scanned_at: 'desc' },
				}),
				this.prisma.pluginScan.count({
					where: { environment_id: BigInt(envId) },
				}),
			])
			.then(([items, total]) => ({ items, total, page, limit }));
	}

	async enqueueScan(environmentId: number) {
		const exec = await this.prisma.jobExecution.create({
			data: {
				environment_id: BigInt(environmentId),
				job_type: JOB_TYPES.PLUGIN_SCAN_RUN,
				status: 'pending',
			},
		});
		const job = await this.queue.add(
			JOB_TYPES.PLUGIN_SCAN_RUN,
			{ environmentId, jobExecutionId: Number(exec.id) },
			{ ...DEFAULT_JOB_OPTIONS, jobId: `plugin-scan-${exec.id}` },
		);
		return { jobExecutionId: exec.id, bullJobId: job.id };
	}
}
