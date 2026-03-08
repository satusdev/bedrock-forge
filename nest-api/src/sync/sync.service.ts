import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatusService } from '../task-status/task-status.service';

type ProjectServerRow = {
	id: number;
	project_id: number;
	environment: string;
	wp_url: string;
	wp_path: string;
	server_id: number;
	server_name: string;
	panel_type: string;
};

type PendingSyncTask = {
	task_id: string;
	kind: string;
	payload: Record<string, unknown>;
};

@Injectable()
export class SyncService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly taskStatusService: TaskStatusService,
	) {}

	private readonly fallbackOwnerId = 1;
	private readonly taskQueue: PendingSyncTask[] = [];

	private getPanelSyncMethod(panelType: string) {
		switch (panelType) {
			case 'none':
				return 'ssh_wp_cli';
			case 'cyberpanel':
				return 'ssh_mysql';
			case 'cpanel':
				return 'uapi_or_ssh';
			case 'plesk':
				return 'ssh_mysql';
			case 'directadmin':
				return 'ssh_mysql';
			default:
				return 'ssh_wp_cli';
		}
	}

	private async getProjectServer(projectServerId: number, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const projectServer = await this.prisma.project_servers.findFirst({
			where: {
				id: projectServerId,
				projects: {
					is: {
						owner_id: resolvedOwnerId,
					},
				},
			},
			select: {
				id: true,
				project_id: true,
				environment: true,
				wp_url: true,
				wp_path: true,
				server_id: true,
				servers: {
					select: {
						name: true,
						panel_type: true,
					},
				},
			},
		});
		if (!projectServer) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}
		return {
			id: projectServer.id,
			project_id: projectServer.project_id,
			environment: projectServer.environment,
			wp_url: projectServer.wp_url,
			wp_path: projectServer.wp_path,
			server_id: projectServer.server_id,
			server_name: projectServer.servers.name,
			panel_type: projectServer.servers.panel_type,
		} satisfies ProjectServerRow;
	}

	private enqueueTask(kind: string, payload: Record<string, unknown>) {
		const taskId = randomUUID();
		this.taskQueue.push({
			task_id: taskId,
			kind,
			payload,
		});
		this.taskStatusService.upsertTaskStatus(taskId, {
			status: 'pending',
			message: `${kind} task queued`,
			progress: 0,
			result: null,
		});
		return taskId;
	}

	claimPendingTasks(limit = 10) {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		return this.taskQueue.splice(0, safeLimit);
	}

	processPendingTask(task: PendingSyncTask) {
		this.taskStatusService.upsertTaskStatus(task.task_id, {
			status: 'running',
			message: `${task.kind} task running`,
			progress: 50,
		});

		this.taskStatusService.upsertTaskStatus(task.task_id, {
			status: 'completed',
			message: `${task.kind} task completed`,
			progress: 100,
			result: task.payload,
		});

		return {
			task_id: task.task_id,
			status: 'completed',
		};
	}

	pullDatabase(
		payload: {
			source_project_server_id: number;
			target?: string;
			search_replace?: boolean;
		},
		ownerId?: number,
	) {
		return this.getProjectServer(
			payload.source_project_server_id,
			ownerId,
		).then(source => {
			const taskId = this.enqueueTask('sync.pull_database', {
				source_project_server_id: payload.source_project_server_id,
				target: payload.target ?? 'local',
			});
			return {
				status: 'accepted',
				task_id: taskId,
				source: {
					server: source.server_name,
					environment: source.environment,
					wp_url: source.wp_url,
				},
				target: payload.target ?? 'local',
				sync_method: this.getPanelSyncMethod(source.panel_type),
			};
		});
	}

	pushDatabase(
		payload: {
			source?: string;
			target_project_server_id: number;
			search_replace?: boolean;
			backup_first?: boolean;
		},
		ownerId?: number,
	) {
		return this.getProjectServer(
			payload.target_project_server_id,
			ownerId,
		).then(target => {
			const taskId = this.enqueueTask('sync.push_database', {
				target_project_server_id: payload.target_project_server_id,
				source: payload.source ?? 'local',
			});
			return {
				status: 'accepted',
				task_id: taskId,
				source: payload.source ?? 'local',
				target: {
					server: target.server_name,
					environment: target.environment,
					wp_url: target.wp_url,
				},
				sync_method: this.getPanelSyncMethod(target.panel_type),
				backup_first: payload.backup_first ?? true,
			};
		});
	}

	pullFiles(
		payload: {
			source_project_server_id: number;
			paths?: string[];
			target?: string;
			dry_run?: boolean;
		},
		ownerId?: number,
	) {
		return this.getProjectServer(
			payload.source_project_server_id,
			ownerId,
		).then(source => {
			const taskId = this.enqueueTask('sync.pull_files', {
				source_project_server_id: payload.source_project_server_id,
				target: payload.target ?? 'local',
				paths: payload.paths ?? ['uploads'],
			});
			return {
				status: 'accepted',
				task_id: taskId,
				source: {
					server: source.server_name,
					environment: source.environment,
					wp_path: source.wp_path,
				},
				target: payload.target ?? 'local',
				paths: payload.paths ?? ['uploads'],
				dry_run: payload.dry_run ?? false,
			};
		});
	}

	pushFiles(
		payload: {
			source?: string;
			target_project_server_id: number;
			paths?: string[];
			dry_run?: boolean;
			delete_extra?: boolean;
		},
		ownerId?: number,
	) {
		return this.getProjectServer(
			payload.target_project_server_id,
			ownerId,
		).then(target => {
			const taskId = this.enqueueTask('sync.push_files', {
				target_project_server_id: payload.target_project_server_id,
				source: payload.source ?? 'local',
				paths: payload.paths ?? ['uploads'],
			});
			return {
				status: 'accepted',
				task_id: taskId,
				source: payload.source ?? 'local',
				target: {
					server: target.server_name,
					environment: target.environment,
					wp_path: target.wp_path,
				},
				paths: payload.paths ?? ['uploads'],
				dry_run: payload.dry_run ?? false,
				delete_extra: payload.delete_extra ?? false,
			};
		});
	}

	getStatus(taskId: string) {
		return this.taskStatusService.getTaskStatus(taskId, {
			status: 'pending',
			progress: 0,
			message: 'Task is waiting to be processed',
			started_at: null,
			completed_at: null,
			result: null,
		});
	}

	async fullSync(
		payload: {
			source_project_server_id: number;
			target_project_server_id?: number;
			sync_database?: boolean;
			sync_uploads?: boolean;
			sync_plugins?: boolean;
			sync_themes?: boolean;
			dry_run?: boolean;
		},
		ownerId?: number,
	) {
		const source = await this.getProjectServer(
			payload.source_project_server_id,
			ownerId,
		);
		let targetName = 'local';

		if (payload.target_project_server_id) {
			const target = await this.getProjectServer(
				payload.target_project_server_id,
				ownerId,
			);
			targetName = target.server_name;
		}

		const taskId = this.enqueueTask('sync.full', {
			source_project_server_id: payload.source_project_server_id,
			target_project_server_id: payload.target_project_server_id ?? null,
		});

		return {
			status: 'accepted',
			task_id: taskId,
			source: {
				server: source.server_name,
				environment: source.environment,
			},
			target: targetName,
			operations: {
				database: payload.sync_database ?? true,
				uploads: payload.sync_uploads ?? true,
				plugins: payload.sync_plugins ?? false,
				themes: payload.sync_themes ?? false,
			},
			dry_run: payload.dry_run ?? false,
		};
	}

	async runRemoteComposer(
		payload: {
			project_server_id: number;
			command?: string;
			packages?: string[];
			flags?: string[];
		},
		ownerId?: number,
	) {
		const command = payload.command ?? 'update';
		const allowed = ['install', 'update', 'require', 'remove', 'dump-autoload'];
		if (!allowed.includes(command)) {
			throw new BadRequestException({
				detail: `Invalid composer command. Allowed: ${allowed.join(', ')}`,
			});
		}

		const target = await this.getProjectServer(
			payload.project_server_id,
			ownerId,
		);
		const taskId = this.enqueueTask('sync.composer', {
			project_server_id: payload.project_server_id,
			command,
			packages: payload.packages ?? null,
		});
		return {
			status: 'accepted',
			task_id: taskId,
			server: target.server_name,
			environment: target.environment,
			command,
			packages: payload.packages ?? null,
			flags: payload.flags ?? null,
		};
	}
}
