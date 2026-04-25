import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class WpActionsRepository {
	constructor(private readonly prisma: PrismaService) {}

	findEnvironment(envId: bigint) {
		return this.prisma.environment.findUnique({
			where: { id: envId },
			select: {
				id: true,
				root_path: true,
				server: {
					select: {
						id: true,
						ip_address: true,
						ssh_port: true,
						ssh_user: true,
					},
				},
			},
		});
	}

	createJobExecution(data: {
		queue_name: string;
		job_type: string;
		bull_job_id: string;
		environment_id: bigint;
		payload: Prisma.InputJsonObject;
	}) {
		return this.prisma.jobExecution.create({ data });
	}

	findJobExecution(id: bigint) {
		return this.prisma.jobExecution.findUnique({ where: { id } });
	}
}
