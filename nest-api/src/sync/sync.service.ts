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

@Injectable()
export class SyncService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly taskStatusService: TaskStatusService,
	) {}

	private readonly fallbackOwnerId = 1;

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
		const rows = await this.prisma.$queryRaw<ProjectServerRow[]>`
			SELECT
				ps.id,
				ps.project_id,
				ps.environment::text AS environment,
				ps.wp_url,
				ps.wp_path,
				ps.server_id,
				s.name AS server_name,
				s.panel_type::text AS panel_type
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			JOIN servers s ON s.id = ps.server_id
			WHERE ps.id = ${projectServerId}
				AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const projectServer = rows[0];
		if (!projectServer) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}
		return projectServer;
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
			const taskId = randomUUID();
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
			const taskId = randomUUID();
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
		).then(source => ({
			status: 'accepted',
			task_id: randomUUID(),
			source: {
				server: source.server_name,
				environment: source.environment,
				wp_path: source.wp_path,
			},
			target: payload.target ?? 'local',
			paths: payload.paths ?? ['uploads'],
			dry_run: payload.dry_run ?? false,
		}));
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
		).then(target => ({
			status: 'accepted',
			task_id: randomUUID(),
			source: payload.source ?? 'local',
			target: {
				server: target.server_name,
				environment: target.environment,
				wp_path: target.wp_path,
			},
			paths: payload.paths ?? ['uploads'],
			dry_run: payload.dry_run ?? false,
			delete_extra: payload.delete_extra ?? false,
		}));
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

		return {
			status: 'accepted',
			task_id: randomUUID(),
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
		return {
			status: 'accepted',
			task_id: randomUUID(),
			server: target.server_name,
			environment: target.environment,
			command,
			packages: payload.packages ?? null,
			flags: payload.flags ?? null,
		};
	}
}
