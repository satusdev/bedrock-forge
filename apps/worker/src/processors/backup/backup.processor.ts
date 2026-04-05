import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { mkdir, rm, readFile, stat } from 'fs/promises';
import { StepTracker } from '../../services/step-tracker';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { RcloneService } from '../../services/rclone.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import { ConfigService } from '@nestjs/config';

const STAGING_DIR = '/tmp/forge-backups';

/** Lower-case, replace non-alphanumeric runs with hyphens, strip leading/trailing hyphens. */
function slugify(s: string): string {
	return (
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'env'
	);
}

/** Format a Date as YYYY-MM-DD_HH-mm-ss for use in filenames. */
function formatTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Wrap a string in single quotes for safe shell embedding.
 * Single quotes inside the value are escaped as: ' -> '\''
 */
function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * BackupProcessor
 *
 * Handles all jobs on the BACKUPS queue:
 *   - backup:create      — remote execute → SFTP pull → GDrive upload → cleanup
 *   - backup:restore     — GDrive download → SFTP push → remote restore → cleanup
 *   - backup:delete-file — delete orphaned file from GDrive (fire-and-forget)
 */
// 90-min lock: PHP execution (up to 20 min) + large SFTP pull (up to 60 min) + GDrive upload (up to 10 min).
// BullMQ auto-renews at lockDuration/2 intervals, so this safely covers multi-GB backups.
// concurrency=1: backup jobs do SSH+SFTP+tar+rclone — one at a time prevents
// concurrent disk/network saturation on the CX23 VPS.
@Processor(QUEUES.BACKUPS, { concurrency: 1, lockDuration: 90 * 60 * 1_000 })
export class BackupProcessor extends WorkerHost {
	private readonly logger = new Logger(BackupProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly rclone: RcloneService,
		private readonly config: ConfigService,
		private readonly sshKey: SshKeyService,
		private readonly encryption: EncryptionService,
		@InjectQueue(QUEUES.BACKUPS) private readonly backupsQueue: Queue,
	) {
		super();
	}

	async process(job: Job) {
		const {
			environmentId,
			type,
			jobExecutionId,
			backupId,
			filePath,
			scheduleId,
		} = job.data as {
			environmentId?: number;
			type?: string;
			jobExecutionId?: number;
			backupId?: number;
			filePath?: string;
			scheduleId?: number;
		};

		// Fire-and-forget cloud file cleanup — no JobExecution involved
		if (job.name === JOB_TYPES.BACKUP_DELETE_FILE) {
			return this.handleDelete(filePath ?? '');
		}

		// Scheduled backup: create Backup + JobExecution rows, then run create flow
		if (job.name === JOB_TYPES.BACKUP_SCHEDULED) {
			return this.handleScheduled(
				job,
				scheduleId!,
				environmentId!,
				type ?? 'full',
			);
		}

		const isRestore = job.name === JOB_TYPES.BACKUP_RESTORE;

		try {
			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId!) },
				data: { status: 'active', started_at: new Date() },
			});

			if (isRestore) {
				await this.handleRestore(
					job,
					backupId!,
					environmentId!,
					jobExecutionId!,
				);
			} else {
				await this.handleCreate(
					job,
					environmentId!,
					type!,
					jobExecutionId!,
					backupId!,
				);
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Backup job ${job.id} failed: ${msg}`);
			// Mark the pre-created Backup row as failed so the UI reflects it
			if (backupId && !isRestore) {
				await this.prisma.backup
					.update({
						where: { id: BigInt(backupId) },
						data: {
							status: 'failed',
							error_message: msg,
							completed_at: new Date(),
						},
					})
					.catch(() => undefined); // non-fatal if row already gone
			}
			await this.prisma.jobExecution
				.update({
					where: { id: BigInt(jobExecutionId!) },
					data: {
						status: 'failed',
						last_error: msg,
						completed_at: new Date(),
					},
				})
				.catch(e =>
					this.logger.error(
						`Failed to mark JobExecution ${jobExecutionId} as failed: ${e}`,
					),
				);
			throw err;
		}
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	// ── Create ────────────────────────────────────────────────────────────────

	private async handleCreate(
		job: Job,
		environmentId: number,
		type: string,
		jobExecutionId: number,
		backupId: number,
	) {
		const tracker = new StepTracker(
			this.prisma,
			BigInt(jobExecutionId),
			this.logger,
			job.id ?? '',
		);

		const env = await this.prisma.environment.findUniqueOrThrow({
			where: { id: BigInt(environmentId) },
			include: { server: true, project: true },
		});

		if (!env.google_drive_folder_id) {
			throw new Error(
				`Environment ${environmentId} has no google_drive_folder_id configured — backup aborted.`,
			);
		}

		const privateKey = await this.sshKey.resolvePrivateKey(env.server);
		const executor = createRemoteExecutor({
			host: env.server.ip_address,
			port: env.server.ssh_port,
			username: env.server.ssh_user,
			privateKey,
		});

		const scriptsPath = this.config.get<string>('scriptsPath')!;
		const remoteScript = `/tmp/forge_backup_${job.id}.php`;
		const remoteOutput = `/tmp/forge_backup_${job.id}.tar.gz`;
		const localStagingDir = `${STAGING_DIR}/${job.id}`;
		const localFile = `${localStagingDir}/forge_backup_${job.id}.tar.gz`;
		const backupFilename = `${slugify(env.project.name)}_${slugify(env.type)}_${formatTimestamp(new Date())}.tar.gz`;
		let output: { size: number; filename: string } | null = null;

		await tracker.track({
			step: 'Backup started',
			level: 'info',
			detail: `env=${environmentId} type=${type} server=${env.server.ip_address}`,
		});

		// Mark the pre-created Backup row as running
		await this.prisma.backup.update({
			where: { id: BigInt(backupId) },
			data: { status: 'running', started_at: new Date() },
		});

		try {
			// ── Step A: Push backup.php to remote server ────────────────────────
			const scriptContent = await readFile(join(scriptsPath, 'backup.php'));
			await tracker.track({
				step: 'Pushing backup script via SFTP',
				level: 'info',
				detail: `${remoteScript} (${scriptContent.length} bytes)`,
			});
			const pushStart = Date.now();
			await executor.pushFile({
				remotePath: remoteScript,
				content: scriptContent,
			});
			await tracker.track({
				step: 'Backup script uploaded',
				level: 'info',
				durationMs: Date.now() - pushStart,
			});

			// ── Step B: Execute backup.php ──────────────────────────────────────
			// Attempt to retrieve stored DB credentials to pass as fallback CLI args.
			// backup.php will prefer on-disk credentials (wp-config.php / .env) and
			// only use these when filesystem parsing is incomplete.
			let storedCredsArgs = '';
			try {
				const storedCreds = await this.prisma.wpDbCredentials.findUnique({
					where: { environment_id: BigInt(environmentId) },
				});
				if (storedCreds) {
					const dbName = this.encryption.decrypt(storedCreds.db_name_encrypted);
					const dbUser = this.encryption.decrypt(storedCreds.db_user_encrypted);
					const dbPass = this.encryption.decrypt(
						storedCreds.db_password_encrypted,
					);
					const dbHost = this.encryption.decrypt(storedCreds.db_host_encrypted);
					// Shell-quote each value to handle special characters safely
					storedCredsArgs = [
						`--db-name=${shellQuote(dbName)}`,
						`--db-user=${shellQuote(dbUser)}`,
						`--db-pass=${shellQuote(dbPass)}`,
						`--db-host=${shellQuote(dbHost)}`,
					].join(' ');
				}
			} catch (err) {
				this.logger.warn(
					`Could not load stored DB credentials for env ${environmentId}: ${err}`,
				);
			}

			const phpCmd = `php ${remoteScript} --docroot=${env.root_path} --type=${type} --output=${remoteOutput}${storedCredsArgs ? ' ' + storedCredsArgs : ''}`;
			// Mask password in logs — never expose credentials in execution log
			const maskedCmd = phpCmd.replace(/--db-pass='[^']*'/, "--db-pass='***'");
			await tracker.track({
				step: 'Executing backup script',
				level: 'info',
				command: maskedCmd,
			});
			const execStart = Date.now();
			const result = await executor.execute(phpCmd, {
				timeout: 20 * 60 * 1000,
			});
			await tracker.trackCommand(
				'backup.php execution',
				maskedCmd,
				result,
				Date.now() - execStart,
			);

			if (result.code !== 0) {
				throw new Error(
					`backup.php failed (exit ${result.code}): ${result.stderr}`,
				);
			}

			output = JSON.parse(result.stdout) as { size: number; filename: string };
			await job.updateProgress({
				value: 30,
				step: 'Backup script executed on server',
			});

			// ── Step C: Pull backup via SFTP to local staging ───────────────────
			await tracker.track({
				step: 'Pulling backup via SFTP',
				level: 'info',
				detail: remoteOutput,
			});
			// Wipe any stale staging dir before creating fresh (covers BullMQ retries
			// with the same job ID and leftover files from a previous failed attempt).
			await rm(localStagingDir, { recursive: true, force: true }).catch(
				() => undefined,
			);
			await mkdir(localStagingDir, { recursive: true });
			const pullStart = Date.now();
			let lastLoggedMb = 0;
			await executor.pullFileToPath(
				remoteOutput,
				localFile,
				undefined,
				bytes => {
					const mb = Math.floor(bytes / (1024 * 1024));
					if (mb >= lastLoggedMb + 50) {
						lastLoggedMb = mb;
						this.logger.log(
							`[${job.id}] SFTP pull progress: ${mb} MB received`,
						);
					}
				},
			);
			const { size: pulledBytes } = await stat(localFile);
			await tracker.track({
				step: 'Backup pulled via SFTP',
				level: 'info',
				detail: `${localFile} (${pulledBytes} bytes)`,
				durationMs: Date.now() - pullStart,
			});
			await job.updateProgress({
				value: 60,
				step: 'Backup file pulled via SFTP',
			});

			// ── Step D: Upload to Google Drive ────────────────────────────────────
			const configWritten = await this.rclone.writeConfig();
			if (!configWritten) {
				throw new Error(
					'Google Drive not configured — cannot upload backup. Set up rclone in Settings.',
				);
			}
			await tracker.track({
				step: 'Uploading to Google Drive',
				level: 'info',
				detail: `${env.google_drive_folder_id}/${backupFilename}`,
			});
			const uploadStart = Date.now();
			const finalFilePath = await this.rclone.upload(
				localFile,
				env.google_drive_folder_id,
				backupFilename,
			);
			await tracker.track({
				step: 'Google Drive upload complete',
				level: 'info',
				detail: finalFilePath,
				durationMs: Date.now() - uploadStart,
			});
			await job.updateProgress({ value: 85, step: 'Uploaded to Google Drive' });

			// ── Step E: Remote cleanup ──────────────────────────────────────────
			const cleanCmd = `rm -f ${remoteScript} ${remoteOutput}`;
			const cleanStart = Date.now();
			const cleanResult = await executor.execute(cleanCmd);
			await tracker.trackCommand(
				'Remote temp file cleanup',
				cleanCmd,
				cleanResult,
				Date.now() - cleanStart,
			);

			await rm(localFile, { force: true });
			await rm(localStagingDir, { recursive: true, force: true });

			await tracker.track({
				step: 'Backup complete',
				level: 'info',
				detail: `file_path=${finalFilePath} size=${output.size}`,
			});

			// ── Step F: Update the pre-created Backup row to completed ───────────
			await this.prisma.backup.update({
				where: { id: BigInt(backupId) },
				data: {
					status: 'completed',
					file_path: finalFilePath,
					size_bytes: BigInt(output!.size),
					completed_at: new Date(),
				},
			});

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date(), progress: 100 },
			});

			await job.updateProgress({ value: 100, step: 'Backup complete' });
		} catch (err) {
			// Attempt remote cleanup even on failure so temp files do not accumulate
			await executor
				.execute(`rm -f ${remoteScript} ${remoteOutput}`)
				.catch(e =>
					this.logger.warn(
						`[${job.id}] Remote cleanup on failure failed: ${e}`,
					),
				);
			// Always remove local staging dir — prevents large .tar.gz files
			// accumulating in /tmp/forge-backups/ across failed or retried jobs.
			await rm(localFile, { force: true }).catch(() => undefined);
			await rm(localStagingDir, { recursive: true, force: true }).catch(
				() => undefined,
			);
			await tracker
				.track({
					step: 'Backup failed',
					level: 'error',
					detail: err instanceof Error ? err.message : String(err),
				})
				.catch(() => undefined);
			throw err;
		}
	}

	// ── Restore ───────────────────────────────────────────────────────────────

	private async handleRestore(
		job: Job,
		backupId: number,
		environmentId: number,
		jobExecutionId: number,
	) {
		const tracker = new StepTracker(
			this.prisma,
			BigInt(jobExecutionId),
			this.logger,
			job.id ?? '',
		);

		const backup = await this.prisma.backup.findUniqueOrThrow({
			where: { id: BigInt(backupId) },
		});

		if (!backup.file_path) {
			throw new Error('Backup has no file_path — cannot restore.');
		}

		const env = await this.prisma.environment.findUniqueOrThrow({
			where: { id: BigInt(environmentId) },
			include: { server: true },
		});

		const privateKey = await this.sshKey.resolvePrivateKey(env.server);
		const executor = createRemoteExecutor({
			host: env.server.ip_address,
			port: env.server.ssh_port,
			username: env.server.ssh_user,
			privateKey,
		});

		const scriptsPath = this.config.get<string>('scriptsPath')!;
		const remoteScript = `/tmp/forge_restore_${job.id}.php`;
		const remoteBackupPath = `/tmp/forge_restore_${job.id}.tar.gz`;

		await tracker.track({
			step: 'Restore started',
			level: 'info',
			detail: `backupId=${backupId} file_path=${backup.file_path} env=${environmentId}`,
		});

		// ── Retrieve stored DB credentials (fallback for backup.php --restore) ──
		let storedCredsArgs = '';
		try {
			const storedCreds = await this.prisma.wpDbCredentials.findUnique({
				where: { environment_id: BigInt(environmentId) },
			});
			if (storedCreds) {
				const dbName = this.encryption.decrypt(storedCreds.db_name_encrypted);
				const dbUser = this.encryption.decrypt(storedCreds.db_user_encrypted);
				const dbPass = this.encryption.decrypt(
					storedCreds.db_password_encrypted,
				);
				const dbHost = this.encryption.decrypt(storedCreds.db_host_encrypted);
				storedCredsArgs = [
					`--db-name=${shellQuote(dbName)}`,
					`--db-user=${shellQuote(dbUser)}`,
					`--db-pass=${shellQuote(dbPass)}`,
					`--db-host=${shellQuote(dbHost)}`,
				].join(' ');
			}
		} catch (err) {
			this.logger.warn(
				`Could not load stored DB credentials for env ${environmentId}: ${err}`,
			);
		}

		try {
			// ── Step A: Configure rclone ────────────────────────────────────────
			const configWritten = await this.rclone.writeConfig();
			if (!configWritten) {
				throw new Error(
					'Google Drive not configured — cannot restore a cloud backup.',
				);
			}

			// ── Step B: Push restore script via SFTP ────────────────────────────
			const scriptContent = await readFile(join(scriptsPath, 'backup.php'));
			await tracker.track({
				step: 'Pushing restore script via SFTP',
				level: 'info',
				detail: `${remoteScript} (${scriptContent.length} bytes)`,
			});
			await executor.pushFile({
				remotePath: remoteScript,
				content: scriptContent,
			});
			await tracker.track({ step: 'Restore script uploaded', level: 'info' });

			// ── Step C: Stream archive directly from Google Drive → server ──────
			// Zero local temp files — rclone stdout is piped directly into SFTP.
			const totalBytes = backup.size_bytes ? Number(backup.size_bytes) : 0;
			let lastLoggedMb = 0;
			let lastCancelCheckMb = 0;

			await tracker.track({
				step: 'Streaming archive from Google Drive to server',
				level: 'info',
				detail: `${backup.file_path}${totalBytes > 0 ? ` (${Math.round(totalBytes / 1024 / 1024)} MB)` : ''}`,
			});
			await job.updateProgress({ value: 5, step: 'Download stream started' });

			const { child: rcloneChild, stream: downloadStream } =
				this.rclone.downloadStream(backup.file_path);

			// Collect rclone stderr for error reporting
			const rcloneStderrChunks: string[] = [];
			rcloneChild.stderr?.on('data', (chunk: Buffer) => {
				rcloneStderrChunks.push(chunk.toString());
			});

			const streamStart = Date.now();
			await executor.pushFileFromStream(
				remoteBackupPath,
				downloadStream,
				45 * 60 * 1000,
				async bytesTransferred => {
					const mb = Math.floor(bytesTransferred / (1024 * 1024));

					// Check for user cancellation every ~10 MB — responsive but
					// avoids a Redis round-trip on every SFTP chunk event.
					if (mb >= lastCancelCheckMb + 10) {
						lastCancelCheckMb = mb;
						const redis = await this.backupsQueue.client;
						if (await redis.get(`forge:cancel:${job.id}`)) {
							rcloneChild.kill('SIGTERM');
							throw new Error('Cancelled by user');
						}
					}

					if (mb >= lastLoggedMb + 50) {
						lastLoggedMb = mb;
						const totalMb =
							totalBytes > 0 ? Math.round(totalBytes / 1024 / 1024) : 0;
						const pct =
							totalBytes > 0
								? Math.min(
										75,
										Math.floor(5 + (bytesTransferred / totalBytes) * 70),
									)
								: Math.min(75, 5 + Math.floor(mb / 10));

						await tracker.track({
							step: 'Streaming archive to server',
							level: 'info',
							detail: `${mb} MB transferred${totalMb > 0 ? ` / ${totalMb} MB` : ''}`,
							durationMs: Date.now() - streamStart,
						});
						await job.updateProgress({
							value: pct,
							step: `Streaming: ${mb} MB${totalMb > 0 ? ` / ${totalMb} MB` : ''}`,
						});
					}
				},
			);

			// Verify rclone exited cleanly after stdout closed
			await new Promise<void>((resolve, reject) => {
				if (rcloneChild.exitCode !== null) {
					// Already exited
					if (rcloneChild.exitCode !== 0) {
						reject(
							new Error(
								`rclone cat failed (exit ${rcloneChild.exitCode}): ${rcloneStderrChunks.join('')}`,
							),
						);
					} else {
						resolve();
					}
					return;
				}
				rcloneChild.on('close', code => {
					if (code !== 0) {
						reject(
							new Error(
								`rclone cat failed (exit ${code}): ${rcloneStderrChunks.join('')}`,
							),
						);
					} else {
						resolve();
					}
				});
				rcloneChild.on('error', reject);
			});

			await tracker.track({
				step: 'Archive transferred to server',
				level: 'info',
				detail: `${lastLoggedMb} MB — ${remoteBackupPath}`,
				durationMs: Date.now() - streamStart,
			});
			await job.updateProgress({
				value: 78,
				step: 'Archive on server, starting restore',
			});

			// ── Step D: Execute restore script ──────────────────────────────────
			// Final cancellation gate before the irreversible restore script runs.
			{
				const redis = await this.backupsQueue.client;
				if (await redis.get(`forge:cancel:${job.id}`)) {
					throw new Error('Cancelled by user');
				}
			}

			const restoreCmd = `php ${remoteScript} --restore --file=${remoteBackupPath} --docroot=${env.root_path}${storedCredsArgs ? ' ' + storedCredsArgs : ''}`;
			const maskedCmd = restoreCmd.replace(
				/--db-pass='[^']*'/,
				"--db-pass='***'",
			);

			await tracker.track({
				step: 'Executing restore script',
				level: 'info',
				command: maskedCmd,
				detail: `docroot=${env.root_path}`,
			});
			const execStart = Date.now();
			const result = await executor.execute(restoreCmd, {
				timeout: 20 * 60 * 1000,
			});
			await tracker.trackCommand(
				'backup.php restore execution',
				maskedCmd,
				result,
				Date.now() - execStart,
			);

			if (result.code !== 0) {
				throw new Error(
					`Restore failed (exit ${result.code}): ${result.stderr}`,
				);
			}

			// Parse result to log db_imported status
			try {
				const parsed = JSON.parse(result.stdout) as { db_imported?: boolean };
				await tracker.track({
					step: parsed.db_imported
						? 'Files + database restored'
						: 'Files restored (no DB dump found)',
					level: 'info',
					detail: `db_imported=${String(parsed.db_imported ?? false)}`,
				});
			} catch {
				// Non-fatal — log raw output
				await tracker.track({
					step: 'Restore script completed',
					level: 'info',
				});
			}

			await job.updateProgress({
				value: 95,
				step: 'Cleaning up remote temp files',
			});

			// ── Step E: Remote cleanup ──────────────────────────────────────────
			const cleanCmd = `rm -f ${remoteScript} ${remoteBackupPath}`;
			const cleanResult = await executor.execute(cleanCmd);
			await tracker.trackCommand(
				'Remote temp file cleanup',
				cleanCmd,
				cleanResult,
				0,
			);

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date(), progress: 100 },
			});
			await job.updateProgress({ value: 100, step: 'Restore complete' });
			await tracker.track({ step: 'Restore complete', level: 'info' });
		} catch (err) {
			// Best-effort remote cleanup — do not suppress original error
			await executor
				.execute(`rm -f ${remoteScript} ${remoteBackupPath}`)
				.catch(e =>
					this.logger.warn(
						`[${job.id}] Remote cleanup on failure failed: ${e}`,
					),
				);
			await tracker
				.track({
					step: 'Restore failed',
					level: 'error',
					detail: err instanceof Error ? err.message : String(err),
				})
				.catch(() => undefined);
			throw err;
		}
	}

	// ── Scheduled backup ──────────────────────────────────────────────────────

	private async handleScheduled(
		job: Job,
		scheduleId: number,
		environmentId: number,
		type: string,
	) {
		this.logger.log(
			`[${job.id}] Scheduled backup triggered: scheduleId=${scheduleId} env=${environmentId} type=${type}`,
		);

		// Guard: if the schedule was deleted from the DB, self-clean the orphaned repeatable job
		const scheduleRecord = await this.prisma.backupSchedule.findUnique({
			where: { id: BigInt(scheduleId) },
		});
		if (!scheduleRecord) {
			this.logger.warn(
				`[${job.id}] Schedule ${scheduleId} no longer exists in DB — removing orphaned repeatable job and skipping`,
			);
			try {
				const repeatableJobs = await this.backupsQueue.getRepeatableJobs();
				const orphanKey = `backup-schedule-${scheduleId}`;
				for (const rj of repeatableJobs) {
					if (rj.id === orphanKey) {
						await this.backupsQueue.removeRepeatableByKey(rj.key);
						this.logger.log(
							`[${job.id}] Removed orphaned repeatable job: ${rj.key}`,
						);
					}
				}
			} catch (cleanupErr) {
				this.logger.warn(
					`[${job.id}] Could not remove orphaned repeatable job: ${cleanupErr}`,
				);
			}
			return;
		}

		// Create the Backup and JobExecution rows, then delegate to handleCreate
		const bullJobId = job.id ?? String(scheduleId);

		const exec = await this.prisma.jobExecution.create({
			data: {
				queue_name: QUEUES.BACKUPS,
				bull_job_id: bullJobId,
				environment_id: BigInt(environmentId),
				status: 'active',
				started_at: new Date(),
				payload: { scheduleId, environmentId, type } as object,
			},
		});

		const env = await this.prisma.environment.findUniqueOrThrow({
			where: { id: BigInt(environmentId) },
		});

		if (!env.google_drive_folder_id) {
			await this.prisma.jobExecution.update({
				where: { id: exec.id },
				data: {
					status: 'failed',
					last_error: `Environment ${environmentId} has no google_drive_folder_id`,
					completed_at: new Date(),
				},
			});
			this.logger.error(
				`[${job.id}] Scheduled backup aborted: no google_drive_folder_id on env ${environmentId}`,
			);
			return;
		}

		const backup = await this.prisma.backup.create({
			data: {
				environment_id: BigInt(environmentId),
				job_execution_id: exec.id,
				type: type as 'full' | 'db_only' | 'files_only',
				status: 'running',
				started_at: new Date(),
			},
		});

		// Update schedule's last_run_at
		await this.prisma.backupSchedule
			.update({
				where: { id: BigInt(scheduleId) },
				data: { last_run_at: new Date() },
			})
			.catch(e =>
				this.logger.warn(`Could not update schedule last_run_at: ${e}`),
			);

		// Delegate to the standard create flow
		const jobExecutionId = Number(exec.id);
		const backupId = Number(backup.id);

		try {
			await this.handleCreate(
				job,
				environmentId,
				type,
				jobExecutionId,
				backupId,
			);
		} catch (err) {
			// handleCreate already marks backup + jobExecution as failed
			throw err;
		}

		// Run retention cleanup after a successful scheduled backup (non-fatal)
		await this.cleanupRetention(
			environmentId,
			backupId,
			scheduleRecord.retention_count ?? null,
			scheduleRecord.retention_days ?? null,
		).catch(err =>
			this.logger.warn(
				`[${job.id}] Retention cleanup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
			),
		);
	}

	// ── Retention cleanup ─────────────────────────────────────────────────────

	/**
	 * After a successful scheduled backup, prune older scheduled backups that
	 * exceed the environment's retention policy. Only scheduled backups
	 * (job_type = 'backup:scheduled') are considered — manual backups are never
	 * auto-deleted. Runs non-fatally: failures are logged but do not fail the job.
	 */
	private async cleanupRetention(
		environmentId: number,
		justCreatedBackupId: number,
		retentionCount: number | null,
		retentionDays: number | null,
	): Promise<void> {
		if (!retentionCount && !retentionDays) return;

		// Fetch all completed scheduled backups for this environment,
		// ordered newest-first, excluding the backup just created.
		const scheduledBackups = await this.prisma.backup.findMany({
			where: {
				environment_id: BigInt(environmentId),
				status: 'completed',
				id: { not: BigInt(justCreatedBackupId) },
				jobExecution: {
					job_type: JOB_TYPES.BACKUP_SCHEDULED,
				},
			},
			orderBy: { created_at: 'desc' },
			select: { id: true, file_path: true, created_at: true },
		});

		const toDelete = new Set<bigint>();

		// Count limit: justCreated counts as 1. Keep (retentionCount - 1) from
		// the sorted list and mark the remainder for deletion.
		if (retentionCount && scheduledBackups.length >= retentionCount) {
			for (const b of scheduledBackups.slice(retentionCount - 1)) {
				toDelete.add(b.id);
			}
		}

		// Age limit: mark anything older than retentionDays for deletion.
		if (retentionDays) {
			const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
			for (const b of scheduledBackups) {
				if (b.created_at < cutoff) toDelete.add(b.id);
			}
		}

		if (toDelete.size === 0) return;

		this.logger.log(
			`[env ${environmentId}] Retention cleanup: removing ${toDelete.size} stale scheduled backup(s)`,
		);

		// Enqueue GDrive file deletion before removing DB rows (fire-and-forget)
		for (const id of toDelete) {
			const b = scheduledBackups.find(sb => sb.id === id);
			if (b?.file_path) {
				await this.backupsQueue.add(
					JOB_TYPES.BACKUP_DELETE_FILE,
					{ filePath: b.file_path },
					{ ...DEFAULT_JOB_OPTIONS, attempts: 5 },
				);
			}
		}

		await this.prisma.backup.deleteMany({
			where: { id: { in: [...toDelete] } },
		});
	}

	// ── Delete file ───────────────────────────────────────────────────────────

	private async handleDelete(filePath: string) {
		if (!filePath) return;

		this.logger.log(`Deleting GDrive backup file: ${filePath}`);
		const configWritten = await this.rclone.writeConfig();

		if (!configWritten) {
			this.logger.warn(
				`No rclone config — cannot delete GDrive file: ${filePath}`,
			);
			return;
		}

		try {
			await this.rclone.deleteFile(filePath);
			this.logger.log(`Deleted GDrive file: ${filePath}`);
		} catch (err) {
			// Non-fatal — log and continue. File can be cleaned up manually.
			this.logger.error(
				`Failed to delete GDrive file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}
