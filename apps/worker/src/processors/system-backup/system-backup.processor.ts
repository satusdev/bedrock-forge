import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, stat, rm } from 'fs/promises';
import { join } from 'path';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RcloneService } from '../../services/rclone.service';

const execFileAsync = promisify(execFile);

const STAGING_DIR = '/tmp/forge-system-backups';

/** Format a Date as YYYY-MM-DD_HH-mm-ss for use in filenames. */
function formatTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * SystemBackupProcessor
 *
 * Handles system-backup:create jobs:
 *   1. Parse DATABASE_URL to extract pg_dump connection params
 *   2. Run pg_dump -Fc to a local tmp file
 *   3. Upload to Google Drive via rclone
 *   4. Update SystemBackup record with file_path + size_bytes
 *   5. Cleanup local tmp file
 */
@Processor(QUEUES.SYSTEM_BACKUPS, {
	concurrency: 1,
	lockDuration: 30 * 60 * 1_000,
})
export class SystemBackupProcessor extends WorkerHost {
	private readonly logger = new Logger(SystemBackupProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly rclone: RcloneService,
	) {
		super();
	}

	async process(job: Job) {
		const { systemBackupId, jobExecutionId, folderId } = job.data as {
			systemBackupId: number;
			jobExecutionId: number;
			folderId: string;
		};

		if (job.name !== JOB_TYPES.SYSTEM_BACKUP_CREATE) {
			this.logger.warn(`Unknown job type: ${job.name}`);
			return;
		}

		const startedAt = new Date();

		// Mark running
		await Promise.all([
			this.prisma.systemBackup.update({
				where: { id: BigInt(systemBackupId) },
				data: { status: 'running', started_at: startedAt },
			}),
			this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'active', started_at: startedAt },
			}),
		]);

		let tmpPath: string | null = null;

		try {
			// 1. Parse DATABASE_URL
			const dbUrl = process.env.DATABASE_URL;
			if (!dbUrl) throw new Error('DATABASE_URL is not set in environment');

			const parsed = new URL(dbUrl);
			const dbHost = parsed.hostname;
			const dbPort = parsed.port || '5432';
			const dbName = parsed.pathname.slice(1); // strip leading "/"
			const dbUser = parsed.username;
			const dbPassword = decodeURIComponent(parsed.password);

			// 2. pg_dump to local tmp file
			await mkdir(STAGING_DIR, { recursive: true });
			const timestamp = formatTimestamp(startedAt);
			const filename = `forge-system-${timestamp}.dump`;
			tmpPath = join(STAGING_DIR, filename);

			this.logger.log(
				`[SystemBackup #${systemBackupId}] Running pg_dump → ${tmpPath}`,
			);

			await execFileAsync(
				'pg_dump',
				[
					'-h',
					dbHost,
					'-p',
					dbPort,
					'-U',
					dbUser,
					'-d',
					dbName,
					'-Fc', // custom compressed format
					'-f',
					tmpPath,
				],
				{
					// Inject PGPASSWORD via env — never shell-interpolate credentials
					env: { ...process.env, PGPASSWORD: dbPassword },
				},
			);

			// 3. Upload to Google Drive
			this.logger.log(
				`[SystemBackup #${systemBackupId}] Uploading to GDrive folder ${folderId}`,
			);

			await this.rclone.writeConfig();
			const remotePath = await this.rclone.upload(tmpPath, folderId, filename);

			// 4. Get file size
			let sizeBytes: bigint | undefined;
			try {
				const s = await stat(tmpPath);
				sizeBytes = BigInt(s.size);
			} catch {
				// Non-fatal: size is informational only
			}

			// 5. Mark completed
			const completedAt = new Date();
			await Promise.all([
				this.prisma.systemBackup.update({
					where: { id: BigInt(systemBackupId) },
					data: {
						status: 'completed',
						file_path: remotePath,
						size_bytes: sizeBytes,
						completed_at: completedAt,
					},
				}),
				this.prisma.jobExecution.update({
					where: { id: BigInt(jobExecutionId) },
					data: {
						status: 'completed',
						progress: 100,
						completed_at: completedAt,
					},
				}),
			]);

			this.logger.log(
				`[SystemBackup #${systemBackupId}] ✓ Completed → ${remotePath}`,
			);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);

			this.logger.error(
				`[SystemBackup #${systemBackupId}] Failed: ${errorMessage}`,
			);

			const completedAt = new Date();
			await Promise.all([
				this.prisma.systemBackup.update({
					where: { id: BigInt(systemBackupId) },
					data: {
						status: 'failed',
						error_message: errorMessage,
						completed_at: completedAt,
					},
				}),
				this.prisma.jobExecution.update({
					where: { id: BigInt(jobExecutionId) },
					data: {
						status: 'failed',
						last_error: errorMessage,
						completed_at: completedAt,
					},
				}),
			]);

			throw err; // Re-throw so BullMQ marks the job as failed
		} finally {
			// 6. Cleanup local tmp file
			if (tmpPath) {
				await rm(tmpPath, { force: true }).catch(() => undefined);
			}
		}
	}
}
