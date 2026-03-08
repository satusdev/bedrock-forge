import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatusService } from '../task-status/task-status.service';
import {
	DriveCloneRequestDto,
	UrlReplaceRequestDto,
} from './dto/migrations.dto';

@Injectable()
export class MigrationsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly taskStatusService: TaskStatusService,
	) {}

	private readonly fallbackOwnerId = 1;
	private readonly driveMirrorRoot =
		process.env.FORGE_GDRIVE_MIRROR_ROOT?.trim() || '/tmp/forge-gdrive';
	private readonly migrationRoot =
		process.env.FORGE_MIGRATIONS_ROOT?.trim() || '/tmp/forge-migrations';

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private sanitizeSegment(value: string) {
		return value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 120);
	}

	private splitDrivePath(value: string | null | undefined) {
		return (value ?? '')
			.split('/')
			.map(segment => this.sanitizeSegment(segment))
			.filter(Boolean);
	}

	private normalizeEnvironment(value: string) {
		const normalized = value.trim().toLowerCase();
		if (
			normalized !== 'production' &&
			normalized !== 'staging' &&
			normalized !== 'development'
		) {
			throw new BadRequestException({
				detail: 'environment must be one of: production, staging, development',
			});
		}
		return normalized;
	}

	private async pathExists(pathValue: string) {
		try {
			await access(pathValue);
			return true;
		} catch {
			return false;
		}
	}

	private async runProcess(command: string, args: string[]) {
		await new Promise<void>((resolvePromise, rejectPromise) => {
			const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
			let stderr = '';

			child.stderr.on('data', chunk => {
				stderr += chunk.toString();
			});

			child.on('error', error => rejectPromise(error));
			child.on('close', code => {
				if (code === 0) {
					resolvePromise();
					return;
				}
				rejectPromise(
					new Error(
						`${command} exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`,
					),
				);
			});
		});
	}

	private async collectCandidateFiles(rootPath: string) {
		const files: string[] = [];
		const stack = [rootPath];
		const allowedExtensions = new Set([
			'.php',
			'.js',
			'.ts',
			'.tsx',
			'.jsx',
			'.css',
			'.scss',
			'.less',
			'.html',
			'.htm',
			'.json',
			'.yml',
			'.yaml',
			'.env',
			'.txt',
			'.md',
			'.sql',
		]);

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) {
				continue;
			}

			const entries = await readdir(current, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.name === '.git' || entry.name === 'node_modules') {
					continue;
				}
				const fullPath = join(current, entry.name);
				if (entry.isDirectory()) {
					stack.push(fullPath);
					continue;
				}
				if (!entry.isFile()) {
					continue;
				}
				const extension = entry.name.includes('.')
					? `.${entry.name.split('.').pop()?.toLowerCase()}`
					: '';
				if (
					allowedExtensions.has(extension) ||
					entry.name.toLowerCase() === 'wp-config.php' ||
					entry.name.toLowerCase() === '.env'
				) {
					files.push(fullPath);
				}
			}
		}

		return files;
	}

	private async replaceInFiles(
		rootPath: string,
		sourceUrl: string,
		targetUrl: string,
		dryRun: boolean,
	) {
		const files = await this.collectCandidateFiles(rootPath);
		let filesMatched = 0;
		let replacements = 0;

		for (const filePath of files) {
			const fileStats = await stat(filePath);
			if (fileStats.size > 5 * 1024 * 1024) {
				continue;
			}
			const raw = await readFile(filePath);
			if (raw.includes(0)) {
				continue;
			}
			const content = raw.toString('utf-8');
			if (!content.includes(sourceUrl)) {
				continue;
			}

			filesMatched += 1;
			const fileReplacementCount = content.split(sourceUrl).length - 1;
			replacements += fileReplacementCount;

			if (!dryRun) {
				const updated = content.split(sourceUrl).join(targetUrl);
				await writeFile(filePath, updated, 'utf-8');
			}
		}

		return {
			files_scanned: files.length,
			files_matched: filesMatched,
			replacements,
		};
	}

	private async resolveArchivePath(
		storagePath: string,
		driveFolderId: string | null,
		storageFileId: string | null,
	) {
		const candidates = [resolve(storagePath)];
		if (driveFolderId && storageFileId) {
			const driveSegments = this.splitDrivePath(driveFolderId);
			if (driveSegments.length > 0) {
				candidates.push(
					join(this.driveMirrorRoot, ...driveSegments, storageFileId),
				);
			}
		}

		for (const candidate of candidates) {
			if (await this.pathExists(candidate)) {
				return candidate;
			}
		}

		return null;
	}

	async migrateUrlReplace(payload: UrlReplaceRequestDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const taskId = randomUUID();
		const rows = await this.prisma.$queryRaw<
			Array<{
				id: number;
				project_id: number;
				environment: string;
				wp_path: string;
				project_name: string;
				project_slug: string;
			}>
		>`
			SELECT ps.id
				, ps.project_id
				, ps.environment::text AS environment
				, ps.wp_path
				, p.name AS project_name
				, p.slug AS project_slug
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${payload.project_server_id}
				AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const environment = rows[0];
		if (!environment) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}

		const wpPath = resolve(environment.wp_path);
		if (!(await this.pathExists(wpPath))) {
			throw new NotFoundException({
				detail: 'Environment path not found on disk',
			});
		}

		this.taskStatusService.upsertTaskStatus(taskId, {
			status: 'running',
			message: `Running URL replacement for ${environment.project_name}`,
			progress: 5,
		});

		try {
			let backupPath: string | null = null;
			if (payload.backup_before ?? true) {
				backupPath = join(
					this.migrationRoot,
					'url-replace',
					this.sanitizeSegment(environment.project_slug),
					this.sanitizeSegment(environment.environment),
					`pre-replace-${taskId}.tar.gz`,
				);
				await mkdir(dirname(backupPath), { recursive: true });
				await this.runProcess('tar', [
					'-czf',
					backupPath,
					'-C',
					dirname(wpPath),
					basename(wpPath),
				]);
			}

			this.taskStatusService.upsertTaskStatus(taskId, {
				status: 'running',
				message: 'Applying URL replacements',
				progress: 40,
			});

			const replacement = await this.replaceInFiles(
				wpPath,
				payload.source_url,
				payload.target_url,
				payload.dry_run ?? false,
			);

			if (!(payload.dry_run ?? false)) {
				await this.prisma.$executeRaw`
					UPDATE project_servers
					SET wp_url = ${payload.target_url}, updated_at = NOW()
					WHERE id = ${environment.id}
				`;

				await this.prisma.$executeRaw`
					UPDATE projects
					SET wp_home = ${payload.target_url}, updated_at = NOW()
					WHERE id = ${environment.project_id}
						AND EXISTS (
							SELECT 1
							FROM project_servers ps
							WHERE ps.id = ${environment.id}
								AND ps.project_id = projects.id
								AND ps.is_primary = TRUE
						)
				`;
			}

			const result = {
				project_server_id: payload.project_server_id,
				source_url: payload.source_url,
				target_url: payload.target_url,
				backup_before: payload.backup_before ?? true,
				download_backup: payload.download_backup ?? true,
				dry_run: payload.dry_run ?? false,
				backup_path: backupPath,
				replacement,
			};

			this.taskStatusService.upsertTaskStatus(taskId, {
				status: 'completed',
				message: 'URL replacement completed',
				progress: 100,
				result,
			});

			return {
				status: 'accepted',
				task_id: taskId,
				execution_status: 'completed',
				...result,
			};
		} catch (error) {
			const detail =
				error instanceof Error ? error.message : 'Unknown migration failure';
			this.taskStatusService.upsertTaskStatus(taskId, {
				status: 'failed',
				message: detail,
				progress: 100,
				result: { error: detail },
			});
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException
			) {
				throw error;
			}
			throw new InternalServerErrorException({
				detail: `URL replacement failed: ${detail}`,
			});
		}
	}

	async cloneFromDrive(payload: DriveCloneRequestDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const taskId = randomUUID();

		const projectRows = await this.prisma.$queryRaw<
			Array<{ id: number; name: string; slug: string }>
		>`
			SELECT id
				, name
				, slug
			FROM projects
			WHERE id = ${payload.project_id}
				AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const targetServerRows = await this.prisma.$queryRaw<Array<{ id: number }>>`
			SELECT id
			FROM servers
			WHERE id = ${payload.target_server_id}
				AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!targetServerRows[0]) {
			throw new NotFoundException({ detail: 'Target server not found' });
		}

		const normalizedEnvironment = this.normalizeEnvironment(
			payload.environment,
		);
		const backupTimestamp = new Date(payload.backup_timestamp);
		if (Number.isNaN(backupTimestamp.getTime())) {
			throw new BadRequestException({ detail: 'Invalid backup_timestamp' });
		}

		this.taskStatusService.upsertTaskStatus(taskId, {
			status: 'running',
			message: `Preparing drive clone for ${project.name}`,
			progress: 5,
		});

		try {
			const backupRows = await this.prisma.$queryRaw<
				Array<{
					id: number;
					name: string;
					storage_path: string;
					storage_file_id: string | null;
					drive_folder_id: string | null;
					created_at: Date;
				}>
			>`
				SELECT
					id,
					name,
					storage_path,
					storage_file_id,
					drive_folder_id,
					created_at
				FROM backups
				WHERE project_id = ${payload.project_id}
					AND status = ${'completed'}::backupstatus
					AND created_at <= ${backupTimestamp}
				ORDER BY created_at DESC
				LIMIT 1
			`;

			const backup = backupRows[0];
			if (!backup) {
				throw new NotFoundException({
					detail: 'No completed backup found at or before backup_timestamp',
				});
			}

			const archivePath = await this.resolveArchivePath(
				backup.storage_path,
				backup.drive_folder_id,
				backup.storage_file_id,
			);
			if (!archivePath) {
				throw new NotFoundException({
					detail: 'Backup archive is not available on disk',
				});
			}

			const targetPath = join(
				this.migrationRoot,
				'drive-clone',
				this.sanitizeSegment(payload.target_domain),
				normalizedEnvironment,
				`clone-${taskId}`,
			);
			await mkdir(targetPath, { recursive: true });

			if (payload.include_files ?? true) {
				await this.runProcess('tar', ['-xzf', archivePath, '-C', targetPath]);
			}

			let replacement = null as {
				files_scanned: number;
				files_matched: number;
				replacements: number;
			} | null;
			if (
				payload.source_url &&
				payload.target_url &&
				(payload.include_files ?? true)
			) {
				replacement = await this.replaceInFiles(
					targetPath,
					payload.source_url,
					payload.target_url,
					payload.dry_run ?? false,
				);
			}

			if (payload.include_database ?? false) {
				await writeFile(
					join(targetPath, 'database-restore.todo'),
					JSON.stringify(
						{
							project_id: payload.project_id,
							backup_id: backup.id,
							generated_at: new Date().toISOString(),
						},
						null,
						2,
					),
					'utf-8',
				);
			}

			const existingLinkRows = await this.prisma.$queryRaw<
				Array<{ id: number }>
			>`
				SELECT id
				FROM project_servers
				WHERE project_id = ${payload.project_id}
					AND server_id = ${payload.target_server_id}
					AND environment = ${normalizedEnvironment}::serverenvironment
				LIMIT 1
			`;

			if (existingLinkRows[0]) {
				await this.prisma.$executeRaw`
					UPDATE project_servers
					SET
						wp_url = ${`https://${payload.target_domain}`},
						wp_path = ${targetPath},
						updated_at = NOW()
					WHERE id = ${existingLinkRows[0].id}
				`;
			} else {
				await this.prisma.$executeRaw`
					INSERT INTO project_servers (
						project_id,
						server_id,
						environment,
						wp_path,
						wp_url,
						is_primary,
						created_at,
						updated_at
					)
					VALUES (
						${payload.project_id},
						${payload.target_server_id},
						${normalizedEnvironment}::serverenvironment,
						${targetPath},
						${`https://${payload.target_domain}`},
						${false},
						NOW(),
						NOW()
					)
				`;
			}

			const result = {
				project_id: payload.project_id,
				target_server_id: payload.target_server_id,
				target_domain: payload.target_domain,
				environment: normalizedEnvironment,
				backup_timestamp: payload.backup_timestamp,
				backup_id: backup.id,
				backup_name: backup.name,
				archive_path: archivePath,
				clone_path: targetPath,
				replacement,
				dry_run: payload.dry_run ?? false,
			};

			this.taskStatusService.upsertTaskStatus(taskId, {
				status: 'completed',
				message: 'Drive clone completed',
				progress: 100,
				result,
			});

			return {
				status: 'accepted',
				task_id: taskId,
				execution_status: 'completed',
				...result,
			};
		} catch (error) {
			const detail =
				error instanceof Error ? error.message : 'Unknown clone failure';
			this.taskStatusService.upsertTaskStatus(taskId, {
				status: 'failed',
				message: detail,
				progress: 100,
				result: { error: detail },
			});
			if (
				error instanceof NotFoundException ||
				error instanceof BadRequestException
			) {
				throw error;
			}
			throw new InternalServerErrorException({
				detail: `Drive clone failed: ${detail}`,
			});
		}
	}
}
