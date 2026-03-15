import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SyncRepository } from './sync.repository';
import { TaskStatusService } from '../task-status/task-status.service';
import { promisify } from 'util';

type ProjectServerRow = {
	id: number;
	project_id: number;
	environment: string;
	wp_url: string;
	wp_path: string;
	server_id: number;
	server_name: string;
	hostname: string;
	ssh_user: string;
	ssh_port: number;
	ssh_key_path: string | null;
	ssh_password: string | null;
	ssh_private_key: string | null;
	panel_type: string;
};

type PendingSyncTask = {
	task_id: string;
	kind: string;
	project_id: number | null;
	payload: Record<string, unknown>;
};

@Injectable()
export class SyncService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly syncRepository: SyncRepository,
		private readonly taskStatusService: TaskStatusService,
	) {}

	private readonly fallbackOwnerId = 1;
	private readonly taskQueue: PendingSyncTask[] = [];
	private readonly execFileAsync = promisify(execFile);

	private formatLogLine(message: string) {
		return `[${new Date().toISOString()}] ${message}`;
	}

	private shellQuote(value: string) {
		return `'${value.replace(/'/g, `"'"'`)}'`;
	}

	private normalizePath(input: string) {
		const normalized = input.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
		if (normalized.length === 0) {
			return '/';
		}
		return normalized.endsWith('/') && normalized !== '/'
			? normalized.slice(0, -1)
			: normalized;
	}

	private joinPosix(base: string, child: string) {
		return this.normalizePath(`${base}/${child}`);
	}

	private expandHomePath(input: string | null) {
		if (!input) {
			return null;
		}
		if (!input.startsWith('~/')) {
			return input;
		}
		return path.join(os.homedir(), input.slice(2));
	}

	private async isReadableFile(filePath: string) {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	private async getSystemPrivateKey() {
		return this.syncRepository.getSystemPrivateKey();
	}

	private async resolveSshKeyPath(server: ProjectServerRow) {
		let keyFilePath: string | undefined;
		let tempDirectory: string | undefined;

		if (server.ssh_key_path) {
			const expandedPath = this.expandHomePath(server.ssh_key_path);
			if (expandedPath && (await this.isReadableFile(expandedPath))) {
				keyFilePath = expandedPath;
			}
		}

		if (!keyFilePath) {
			const inlinePrivateKeyRaw =
				server.ssh_private_key && server.ssh_private_key.trim().length > 0
					? server.ssh_private_key
					: await this.getSystemPrivateKey();
			const inlinePrivateKey = inlinePrivateKeyRaw
				? inlinePrivateKeyRaw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
				: null;

			if (inlinePrivateKey && inlinePrivateKey.trim().length > 0) {
				tempDirectory = await fs.mkdtemp(
					path.join(os.tmpdir(), 'forge-sync-ssh-'),
				);
				keyFilePath = path.join(tempDirectory, 'id_rsa');
				await fs.writeFile(keyFilePath, `${inlinePrivateKey.trim()}\n`, {
					encoding: 'utf-8',
					mode: 0o600,
				});
			}
		}

		return {
			keyFilePath,
			tempDirectory,
		};
	}

	private summarizeExecError(error: unknown) {
		if (!(error instanceof Error)) {
			return 'Unknown command error';
		}

		const execError = error as Error & {
			code?: number | string;
			stderr?: string;
			stdout?: string;
			signal?: string;
		};
		const parts: string[] = [];

		if (typeof execError.code !== 'undefined') {
			parts.push(`code=${String(execError.code)}`);
		}
		if (execError.signal) {
			parts.push(`signal=${execError.signal}`);
		}

		const stderr = typeof execError.stderr === 'string' ? execError.stderr : '';
		const stdout = typeof execError.stdout === 'string' ? execError.stdout : '';
		const stderrTail = stderr.trim().split('\n').slice(-3).join(' | ');
		const stdoutTail = stdout.trim().split('\n').slice(-2).join(' | ');

		if (stderrTail) {
			parts.push(`stderr=${stderrTail}`);
		} else if (stdoutTail) {
			parts.push(`stdout=${stdoutTail}`);
		}

		if (parts.length === 0) {
			parts.push(error.message);
		}

		return parts.join('; ');
	}

	private async runSshCommand(
		server: ProjectServerRow,
		command: string,
		privateKeyPath: string,
	) {
		const args = ['-p', String(server.ssh_port ?? 22), '-o', 'BatchMode=yes'];
		args.push('-o', 'StrictHostKeyChecking=no');
		args.push('-o', 'UserKnownHostsFile=/dev/null');
		args.push('-i', privateKeyPath);
		const target = `${server.ssh_user || 'root'}@${server.hostname}`;
		args.push(target, command);
		return this.execFileAsync('ssh', args, {
			timeout: 120000,
			maxBuffer: 1024 * 1024 * 2,
		});
	}

	private buildSshRsyncCommand(server: ProjectServerRow, keyFilePath: string) {
		return `ssh -p ${server.ssh_port ?? 22} -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i ${this.shellQuote(keyFilePath)}`;
	}

	private getPathCandidates(server: ProjectServerRow, pathToken: string) {
		const normalizedToken = pathToken.trim().replace(/^\/+/, '');
		if (normalizedToken.length === 0) {
			return [this.joinPosix(server.wp_path, 'web/app/uploads')];
		}
		if (normalizedToken === 'uploads') {
			return [
				this.joinPosix(server.wp_path, 'web/app/uploads'),
				this.joinPosix(server.wp_path, 'wp-content/uploads'),
			];
		}
		if (normalizedToken === 'plugins') {
			return [
				this.joinPosix(server.wp_path, 'web/app/plugins'),
				this.joinPosix(server.wp_path, 'wp-content/plugins'),
			];
		}
		if (normalizedToken === 'themes') {
			return [
				this.joinPosix(server.wp_path, 'web/app/themes'),
				this.joinPosix(server.wp_path, 'wp-content/themes'),
			];
		}
		if (pathToken.startsWith('/')) {
			return [this.normalizePath(pathToken)];
		}
		return [this.joinPosix(server.wp_path, normalizedToken)];
	}

	private async resolveExistingRemotePath(
		server: ProjectServerRow,
		pathToken: string,
		keyFilePath: string,
	) {
		const candidates = this.getPathCandidates(server, pathToken);
		for (const candidate of candidates) {
			const probe = await this.runSshCommand(
				server,
				`test -d ${this.shellQuote(candidate)} && echo __FORGE_EXISTS__ || true`,
				keyFilePath,
			);
			if ((probe.stdout || '').includes('__FORGE_EXISTS__')) {
				return candidate;
			}
		}
		return candidates[0];
	}

	private async executeRsyncFileTask(task: PendingSyncTask) {
		const payload = task.payload;
		const ownerIdRaw = payload.owner_id;
		const ownerId =
			typeof ownerIdRaw === 'number' && Number.isFinite(ownerIdRaw)
				? ownerIdRaw
				: this.fallbackOwnerId;

		const sourceProjectServerIdRaw = payload.source_project_server_id;
		const targetProjectServerIdRaw = payload.target_project_server_id;
		const sourceProjectServerId =
			typeof sourceProjectServerIdRaw === 'number'
				? sourceProjectServerIdRaw
				: null;
		const targetProjectServerId =
			typeof targetProjectServerIdRaw === 'number'
				? targetProjectServerIdRaw
				: null;

		const pathsRaw = payload.paths;
		const paths = Array.isArray(pathsRaw)
			? pathsRaw.filter((entry): entry is string => typeof entry === 'string')
			: ['uploads'];
		const dryRun = payload.dry_run === true;
		const deleteExtra = payload.delete_extra === true;

		if (task.kind !== 'sync.pull_files' && task.kind !== 'sync.push_files') {
			throw new BadRequestException({ detail: 'Invalid rsync task kind' });
		}

		if (task.kind === 'sync.pull_files' && !sourceProjectServerId) {
			throw new BadRequestException({
				detail: 'Missing source project server id',
			});
		}
		if (task.kind === 'sync.push_files' && !targetProjectServerId) {
			throw new BadRequestException({
				detail: 'Missing target project server id',
			});
		}

		const remoteServer =
			task.kind === 'sync.pull_files'
				? await this.getProjectServer(sourceProjectServerId as number, ownerId)
				: await this.getProjectServer(targetProjectServerId as number, ownerId);

		const localBase =
			typeof (task.kind === 'sync.pull_files'
				? payload.target
				: payload.source) === 'string' &&
			(task.kind === 'sync.pull_files' ? payload.target : payload.source)
				? String(
						task.kind === 'sync.pull_files' ? payload.target : payload.source,
					)
				: (process.env.SYNC_LOCAL_BASE_PATH ?? '/tmp/forge-sync');

		await fs.mkdir(localBase, { recursive: true });

		const resolved = await this.resolveSshKeyPath(remoteServer);
		const keyFilePath = resolved.keyFilePath;
		if (!keyFilePath && remoteServer.ssh_password) {
			throw new BadRequestException({
				detail:
					'SSH password auth is configured, but rsync execution requires SSH key auth.',
			});
		}
		if (!keyFilePath) {
			throw new BadRequestException({
				detail: 'No readable SSH key is configured for rsync execution',
			});
		}

		try {
			const sshCommand = this.buildSshRsyncCommand(remoteServer, keyFilePath);
			for (const pathToken of paths) {
				const remotePathCandidate = await this.resolveExistingRemotePath(
					remoteServer,
					pathToken,
					keyFilePath,
				);
				const remotePath =
					remotePathCandidate ??
					this.getPathCandidates(remoteServer, pathToken)[0] ??
					this.joinPosix(remoteServer.wp_path, 'web/app/uploads');
				const localPath = path.join(localBase, pathToken.replace(/^\/+/, ''));
				await fs.mkdir(localPath, { recursive: true });

				const args = ['-az'];
				if (dryRun) {
					args.push('--dry-run');
				}
				if (deleteExtra) {
					args.push('--delete');
				}
				args.push('-e', sshCommand);

				if (task.kind === 'sync.pull_files') {
					args.push(
						`${remoteServer.ssh_user}@${remoteServer.hostname}:${remotePath.replace(/\/$/, '')}/`,
						`${localPath.replace(/\/$/, '')}/`,
					);
				} else {
					args.push(
						`${localPath.replace(/\/$/, '')}/`,
						`${remoteServer.ssh_user}@${remoteServer.hostname}:${remotePath.replace(/\/$/, '')}/`,
					);
				}

				await this.appendTaskLog(
					task.task_id,
					`CMD rsync ${args.map(arg => (arg.includes(' ') ? this.shellQuote(arg) : arg)).join(' ')}`,
				);

				const result = await this.execFileAsync('rsync', args, {
					timeout: 120000,
					maxBuffer: 1024 * 1024 * 2,
				});
				const stdout = (result.stdout || '').trim();
				const stderr = (result.stderr || '').trim();
				if (stdout) {
					await this.appendTaskLog(
						task.task_id,
						`RSYNC stdout: ${stdout.split('\n').slice(-3).join(' | ')}`,
					);
				}
				if (stderr) {
					await this.appendTaskLog(
						task.task_id,
						`RSYNC stderr: ${stderr.split('\n').slice(-3).join(' | ')}`,
					);
				}
			}
		} finally {
			if (resolved.tempDirectory) {
				await fs.rm(resolved.tempDirectory, { recursive: true, force: true });
			}
		}
	}

	private async appendTaskLog(taskId: string, message: string) {
		const current = await this.taskStatusService.getTaskStatus(taskId, {
			category: 'sync',
			status: 'pending',
			message: 'Task is queued',
			progress: 0,
			logs: '',
		});
		const nextLogs = [current.logs, this.formatLogLine(message)]
			.filter(Boolean)
			.join('\n');
		await this.taskStatusService.upsertTaskStatus(taskId, {
			category: 'sync',
			project_id: current.project_id ?? null,
			task_kind: current.task_kind ?? null,
			logs: nextLogs,
		});
	}

	private buildCommandTrace(task: PendingSyncTask) {
		const payload = task.payload;
		switch (task.kind) {
			case 'sync.full':
				return [
					`wp db export /tmp/${task.task_id}-source.sql --path=<source_wp_path> --allow-root`,
					`rsync -avz <source_uploads>/ <target_uploads>/`,
					`wp db import /tmp/${task.task_id}-source.sql --path=<target_wp_path> --allow-root`,
				];
			case 'sync.pull_database':
				return [
					`wp db export /tmp/${task.task_id}-remote.sql --path=<remote_wp_path> --allow-root`,
					`wp db import /tmp/${task.task_id}-remote.sql --path=<local_wp_path> --allow-root`,
				];
			case 'sync.push_database':
				return [
					`wp db export /tmp/${task.task_id}-local.sql --path=<local_wp_path> --allow-root`,
					`wp db import /tmp/${task.task_id}-local.sql --path=<remote_wp_path> --allow-root`,
				];
			case 'sync.pull_files':
				return [
					`rsync -avz <remote_paths:${JSON.stringify(payload.paths ?? ['uploads'])}> <local_target>`,
				];
			case 'sync.push_files':
				return [
					`rsync -avz <local_paths:${JSON.stringify(payload.paths ?? ['uploads'])}> <remote_target>`,
				];
			case 'sync.composer':
				return [
					`composer ${typeof payload.command === 'string' ? payload.command : 'update'} ${Array.isArray(payload.packages) ? payload.packages.join(' ') : ''}`.trim(),
				];
			default:
				return ['no-op'];
		}
	}

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
				ssh_user: true,
				ssh_key_path: true,
				server_id: true,
				servers: {
					select: {
						name: true,
						hostname: true,
						ssh_user: true,
						ssh_port: true,
						ssh_key_path: true,
						ssh_password: true,
						ssh_private_key: true,
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
			hostname: projectServer.servers.hostname,
			ssh_user:
				projectServer.ssh_user?.trim() ||
				projectServer.servers.ssh_user?.trim() ||
				'root',
			ssh_port: projectServer.servers.ssh_port ?? 22,
			ssh_key_path:
				projectServer.ssh_key_path ?? projectServer.servers.ssh_key_path,
			ssh_password: projectServer.servers.ssh_password,
			ssh_private_key: projectServer.servers.ssh_private_key,
			panel_type: projectServer.servers.panel_type,
		} satisfies ProjectServerRow;
	}

	private enqueueTask(
		kind: string,
		payload: Record<string, unknown>,
		projectId: number | null,
	) {
		const taskId = randomUUID();
		this.taskQueue.push({
			task_id: taskId,
			kind,
			project_id: projectId,
			payload,
		});
		void this.taskStatusService.upsertTaskStatus(taskId, {
			category: 'sync',
			project_id: projectId,
			task_kind: kind,
			status: 'pending',
			message: `${kind} task queued`,
			progress: 0,
			result: null,
			logs: this.formatLogLine(`${kind} task queued`),
		});
		return taskId;
	}

	claimPendingTasks(limit = 10) {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		return this.taskQueue.splice(0, safeLimit);
	}

	async processPendingTask(task: PendingSyncTask) {
		await this.taskStatusService.upsertTaskStatus(task.task_id, {
			category: 'sync',
			project_id: task.project_id,
			task_kind: task.kind,
			status: 'running',
			message: `${task.kind} task running`,
			progress: 20,
		});
		await this.appendTaskLog(task.task_id, `${task.kind} task running`);

		if (task.kind === 'sync.pull_files' || task.kind === 'sync.push_files') {
			await this.executeRsyncFileTask(task);
		} else {
			const commandTrace = this.buildCommandTrace(task);
			for (const [index, command] of commandTrace.entries()) {
				await this.appendTaskLog(
					task.task_id,
					`CMD[${index + 1}/${commandTrace.length}] ${command}`,
				);
				await this.appendTaskLog(
					task.task_id,
					`RESULT[${index + 1}] simulated success`,
				);
			}
		}

		await this.taskStatusService.upsertTaskStatus(task.task_id, {
			category: 'sync',
			project_id: task.project_id,
			task_kind: task.kind,
			progress: 60,
			message: `${task.kind} task processing payload`,
		});
		await this.appendTaskLog(
			task.task_id,
			`${task.kind} task processing payload`,
		);

		await this.taskStatusService.upsertTaskStatus(task.task_id, {
			category: 'sync',
			project_id: task.project_id,
			task_kind: task.kind,
			status: 'completed',
			message: `${task.kind} task completed`,
			progress: 100,
			result: task.payload,
		});
		await this.appendTaskLog(task.task_id, `${task.kind} task completed`);

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
			const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
			const taskId = this.enqueueTask(
				'sync.pull_database',
				{
					owner_id: resolvedOwnerId,
					project_id: source.project_id,
					source_project_server_id: payload.source_project_server_id,
					target: payload.target ?? 'local',
				},
				source.project_id,
			);
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
			const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
			const taskId = this.enqueueTask(
				'sync.push_database',
				{
					owner_id: resolvedOwnerId,
					project_id: target.project_id,
					target_project_server_id: payload.target_project_server_id,
					source: payload.source ?? 'local',
				},
				target.project_id,
			);
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
			const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
			const taskId = this.enqueueTask(
				'sync.pull_files',
				{
					owner_id: resolvedOwnerId,
					project_id: source.project_id,
					source_project_server_id: payload.source_project_server_id,
					target: payload.target ?? 'local',
					paths: payload.paths ?? ['uploads'],
					dry_run: payload.dry_run ?? false,
				},
				source.project_id,
			);
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
			const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
			const taskId = this.enqueueTask(
				'sync.push_files',
				{
					owner_id: resolvedOwnerId,
					project_id: target.project_id,
					target_project_server_id: payload.target_project_server_id,
					source: payload.source ?? 'local',
					paths: payload.paths ?? ['uploads'],
					dry_run: payload.dry_run ?? false,
					delete_extra: payload.delete_extra ?? false,
				},
				target.project_id,
			);
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
			category: 'sync',
			status: 'pending',
			progress: 0,
			message: 'Task is waiting to be processed',
			logs: '',
			started_at: null,
			completed_at: null,
			result: null,
		});
	}

	async getProjectTaskHistory(projectId: number, ownerId?: number, limit = 20) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: resolvedOwnerId,
			},
			select: { id: true },
		});

		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const history = await this.taskStatusService.listSyncTaskStatuses(
			projectId,
			limit,
		);

		return {
			project_id: projectId,
			tasks: history,
		};
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

		const taskId = this.enqueueTask(
			'sync.full',
			{
				owner_id: ownerId ?? this.fallbackOwnerId,
				project_id: source.project_id,
				source_project_server_id: payload.source_project_server_id,
				target_project_server_id: payload.target_project_server_id ?? null,
			},
			source.project_id,
		);

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
		const taskId = this.enqueueTask(
			'sync.composer',
			{
				owner_id: ownerId ?? this.fallbackOwnerId,
				project_id: target.project_id,
				project_server_id: payload.project_server_id,
				command,
				packages: payload.packages ?? null,
			},
			target.project_id,
		);
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
