import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PromoteRequestDto } from './dto/promote-request.dto';
import { RollbackRequestDto } from './dto/rollback-request.dto';

type DeploymentLog = {
	id: string;
	timestamp: string;
	action: string;
	status: string;
	details: string;
};

@Injectable()
export class DeploymentsService {
	private readonly deploymentLogs: DeploymentLog[] = [];

	async promote(payload: PromoteRequestDto) {
		const taskId = randomUUID();
		this.deploymentLogs.push({
			id: taskId,
			timestamp: new Date().toISOString(),
			action: 'Promote Staging->Prod',
			status: 'success',
			details: `Promotion simulated for ${payload.staging_url} -> ${payload.prod_url}`,
		});

		return {
			status: 'accepted',
			task_id: taskId,
			message: 'Promotion process started background',
		};
	}

	async getHistory() {
		return [...this.deploymentLogs].sort((a, b) =>
			b.timestamp.localeCompare(a.timestamp),
		);
	}

	async rollback(projectName: string, payload: RollbackRequestDto) {
		const taskId = randomUUID();
		this.deploymentLogs.push({
			id: taskId,
			timestamp: new Date().toISOString(),
			action: `Rollback ${projectName}`,
			status: 'success',
			details: payload.target_release
				? `Rollback simulated to ${payload.target_release}`
				: 'Rollback simulated to previous release',
		});

		return {
			status: 'accepted',
			task_id: taskId,
			message: 'Rollback started',
		};
	}
}
