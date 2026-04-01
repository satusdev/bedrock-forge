import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SyncRepository {
	constructor(private readonly prisma: PrismaService) {}

	findEnvironmentById(id: number) {
		return this.prisma.environment.findUniqueOrThrow({
			where: { id: BigInt(id) },
			select: {
				id: true,
				type: true,
				url: true,
				root_path: true,
				google_drive_folder_id: true,
				server: {
					select: {
						id: true,
						name: true,
						ip_address: true,
						ssh_port: true,
						ssh_user: true,
					},
				},
				project: { select: { id: true, name: true } },
			},
		});
	}

	createJobExecution(data: {
		queue_name: string;
		job_type?: string;
		bull_job_id: string;
		environment_id: bigint;
	}) {
		return this.prisma.jobExecution.create({ data });
	}
}
