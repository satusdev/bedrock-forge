import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BackupsService } from './backups.service';

@Injectable()
export class BackupsRunnerService {
	private readonly logger = new Logger(BackupsRunnerService.name);
	private isProcessingPending = false;
	private isProcessingMaintenance = false;
	private readonly enabled =
		(process.env.BACKUP_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false';
	private readonly batchSize = Math.max(
		1,
		Math.min(
			100,
			Number.parseInt(process.env.BACKUP_RUNNER_BATCH_SIZE ?? '5', 10) || 5,
		),
	);
	private readonly maintenanceEnabled =
		(process.env.BACKUP_MAINTENANCE_ENABLED ?? 'true').toLowerCase() !==
		'false';
	private readonly maintenanceBatchSize = Math.max(
		1,
		Math.min(
			100,
			Number.parseInt(process.env.BACKUP_MAINTENANCE_BATCH_SIZE ?? '10', 10) ||
				10,
		),
	);
	private readonly staleMinutes = Math.max(
		5,
		Math.min(
			24 * 60,
			Number.parseInt(process.env.BACKUP_STALE_MINUTES ?? '120', 10) || 120,
		),
	);
	private readonly retentionEnabled =
		(process.env.BACKUP_RETENTION_ENABLED ?? 'false').toLowerCase() !== 'false';
	private readonly retentionDays = Math.max(
		7,
		Math.min(
			3650,
			Number.parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10) || 30,
		),
	);
	private readonly retentionKeepPerProject = Math.max(
		1,
		Math.min(
			1000,
			Number.parseInt(
				process.env.BACKUP_RETENTION_KEEP_PER_PROJECT ?? '20',
				10,
			) || 20,
		),
	);
	private readonly retentionBatchSize = Math.max(
		1,
		Math.min(
			1000,
			Number.parseInt(process.env.BACKUP_RETENTION_BATCH_SIZE ?? '100', 10) ||
				100,
		),
	);
	private readonly fileCleanupEnabled =
		(process.env.BACKUP_FILE_CLEANUP_ENABLED ?? 'false').toLowerCase() !==
		'false';
	private readonly fileCleanupDryRun =
		(process.env.BACKUP_FILE_CLEANUP_DRY_RUN ?? 'true').toLowerCase() !==
		'false';

	constructor(private readonly backupsService: BackupsService) {}

	@Interval(30_000)
	async runPendingBackups() {
		if (!this.enabled || this.isProcessingPending) {
			return;
		}

		this.isProcessingPending = true;
		try {
			const claims = await this.backupsService.claimPendingBackups(
				this.batchSize,
			);
			for (const claim of claims) {
				try {
					await this.backupsService.runBackup(
						claim.id,
						undefined,
						claim.created_by_id,
					);
				} catch (error) {
					const detail =
						error instanceof Error
							? error.message
							: 'Unknown backup runner error';
					this.logger.error(`Backup ${claim.id} failed in runner: ${detail}`);
				}
			}
		} catch (error) {
			const detail =
				error instanceof Error
					? error.message
					: 'Unknown pending backup runner error';
			this.logger.error(`Pending backup runner loop failed: ${detail}`);
		} finally {
			this.isProcessingPending = false;
		}
	}

	@Interval(60_000)
	async runMaintenance() {
		if (!this.maintenanceEnabled || this.isProcessingMaintenance) {
			return;
		}

		this.isProcessingMaintenance = true;
		let staleMarked = 0;
		let prunedCount = 0;
		let cleanupDeleted = 0;
		let cleanupFailed = 0;
		let errorDetail: string | null = null;
		try {
			const stale = await this.backupsService.markStaleRunningBackupsFailed(
				this.staleMinutes,
				this.maintenanceBatchSize,
			);
			staleMarked = stale.length;
			if (stale.length > 0) {
				this.logger.warn(
					`Marked ${stale.length} stale running backup(s) as failed`,
				);
			}

			if (this.retentionEnabled) {
				const pruned = await this.backupsService.pruneTerminalBackups(
					this.retentionDays,
					this.retentionKeepPerProject,
					this.retentionBatchSize,
				);
				prunedCount = pruned.length;
				if (pruned.length > 0) {
					this.logger.log(
						`Pruned ${pruned.length} terminal backup record(s) by retention policy`,
					);

					if (this.fileCleanupEnabled) {
						const cleanup =
							await this.backupsService.cleanupPrunedLocalArtifacts(
								pruned,
								this.fileCleanupDryRun,
							);
						cleanupDeleted = cleanup.deleted;
						cleanupFailed = cleanup.failed;
						this.logger.log(
							`Backup artifact cleanup ${cleanup.dry_run ? '(dry-run) ' : ''}deleted=${cleanup.deleted} eligible=${cleanup.eligible} skipped_unsafe=${cleanup.skipped_unsafe} missing=${cleanup.missing} failed=${cleanup.failed}`,
						);
					}
				}
			}
		} catch (error) {
			errorDetail =
				error instanceof Error ? error.message : 'Unknown maintenance error';
			this.logger.error(`Backup maintenance run failed: ${errorDetail}`);
		} finally {
			this.backupsService.recordMaintenanceSnapshot({
				stale_marked: staleMarked,
				pruned: prunedCount,
				cleanup_deleted: cleanupDeleted,
				cleanup_failed: cleanupFailed,
				error: errorDetail,
			});
			this.isProcessingMaintenance = false;
		}
	}
}
