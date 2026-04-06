import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BackupProcessor } from './backup.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { RcloneService } from '../../services/rclone.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { ConfigService } from '@nestjs/config';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePrisma() {
	return {
		jobExecution: {
			update: jest.fn().mockResolvedValue({}),
		},
		backup: {
			update: jest.fn().mockResolvedValue({}),
			create: jest.fn(),
			findUniqueOrThrow: jest.fn(),
		},
		backupSchedule: {
			findUniqueOrThrow: jest.fn(),
		},
		environment: {
			findUnique: jest.fn(),
		},
	};
}

function makeRclone() {
	return {
		writeConfig: jest.fn().mockResolvedValue(true),
		deleteFile: jest.fn().mockResolvedValue(undefined),
		uploadFile: jest.fn().mockResolvedValue(undefined),
		downloadFile: jest.fn().mockResolvedValue(undefined),
	};
}

function makeConfig() {
	return { get: jest.fn().mockReturnValue('/scripts') };
}

function makeSshKey() {
	return { resolvePrivateKey: jest.fn() };
}

function makeEncryption() {
	return { decrypt: jest.fn(), encrypt: jest.fn() };
}

function makeQueue() {
	return { add: jest.fn().mockResolvedValue({ id: 'new-job-id' }) };
}

function makeJob(name: string, data: object) {
	return { id: 'job-001', name, data, updateProgress: jest.fn() } as any;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('BackupProcessor', () => {
	let processor: BackupProcessor;
	let prisma: ReturnType<typeof makePrisma>;
	let rclone: ReturnType<typeof makeRclone>;
	let queue: ReturnType<typeof makeQueue>;

	beforeEach(async () => {
		prisma = makePrisma();
		rclone = makeRclone();
		queue = makeQueue();

		const module = await Test.createTestingModule({
			providers: [
				BackupProcessor,
				{ provide: PrismaService, useValue: prisma },
				{ provide: RcloneService, useValue: rclone },
				{ provide: ConfigService, useValue: makeConfig() },
				{ provide: SshKeyService, useValue: makeSshKey() },
				{ provide: EncryptionService, useValue: makeEncryption() },
				{ provide: getQueueToken(QUEUES.BACKUPS), useValue: queue },
			],
		}).compile();

		processor = module.get(BackupProcessor);
	});

	// ── Job routing ───────────────────────────────────────────────────────────

	describe('process() routing', () => {
		it('routes backup:delete-file to handleDelete without touching jobExecution', async () => {
			const handleDelete = jest
				.spyOn(processor as any, 'handleDelete')
				.mockResolvedValue(undefined);

			const job = makeJob(JOB_TYPES.BACKUP_DELETE_FILE, {
				filePath: 'backups/old.tar.gz',
			});
			await processor.process(job);

			expect(handleDelete).toHaveBeenCalledWith('backups/old.tar.gz');
			expect(prisma.jobExecution.update).not.toHaveBeenCalled();
		});

		it('routes backup:scheduled to handleScheduled', async () => {
			const handleScheduled = jest
				.spyOn(processor as any, 'handleScheduled')
				.mockResolvedValue(undefined);

			const job = makeJob(JOB_TYPES.BACKUP_SCHEDULED, {
				scheduleId: 5,
				environmentId: 1,
				type: 'full',
			});
			await processor.process(job);

			expect(handleScheduled).toHaveBeenCalledWith(job, 5, 1, 'full');
		});

		it('routes backup:create to handleCreate and marks execution active', async () => {
			const handleCreate = jest
				.spyOn(processor as any, 'handleCreate')
				.mockResolvedValue(undefined);

			const job = makeJob(JOB_TYPES.BACKUP_CREATE, {
				environmentId: 2,
				type: 'db_only',
				jobExecutionId: 10,
				backupId: 20,
			});
			await processor.process(job);

			expect(prisma.jobExecution.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: BigInt(10) },
					data: expect.objectContaining({ status: 'active' }),
				}),
			);
			expect(handleCreate).toHaveBeenCalledWith(job, 2, 'db_only', 10, 20);
		});

		it('routes backup:restore to handleRestore and marks execution active', async () => {
			const handleRestore = jest
				.spyOn(processor as any, 'handleRestore')
				.mockResolvedValue(undefined);

			const job = makeJob(JOB_TYPES.BACKUP_RESTORE, {
				backupId: 7,
				environmentId: 3,
				jobExecutionId: 15,
			});
			await processor.process(job);

			expect(prisma.jobExecution.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: BigInt(15) },
					data: expect.objectContaining({ status: 'active' }),
				}),
			);
			expect(handleRestore).toHaveBeenCalledWith(job, 7, 3, 15);
		});
	});

	// ── Error handling ────────────────────────────────────────────────────────

	describe('process() error handling', () => {
		it('marks backup as failed when handleCreate throws', async () => {
			jest
				.spyOn(processor as any, 'handleCreate')
				.mockRejectedValue(new Error('SSH connection refused'));

			const job = makeJob(JOB_TYPES.BACKUP_CREATE, {
				environmentId: 2,
				type: 'full',
				jobExecutionId: 10,
				backupId: 20,
			});

			await expect(processor.process(job)).rejects.toThrow(
				'SSH connection refused',
			);

			// Backup row must be marked failed
			expect(prisma.backup.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: BigInt(20) },
					data: expect.objectContaining({
						status: 'failed',
						error_message: 'SSH connection refused',
					}),
				}),
			);
			// JobExecution must be marked failed
			const execUpdateCallsWithFailed = (
				prisma.jobExecution.update as jest.Mock
			).mock.calls.filter((call: [any]) => call[0]?.data?.status === 'failed');
			expect(execUpdateCallsWithFailed.length).toBeGreaterThan(0);
		});

		it('marks job execution as failed when handleRestore throws', async () => {
			jest
				.spyOn(processor as any, 'handleRestore')
				.mockRejectedValue(new Error('Backup file not found on GDrive'));

			const job = makeJob(JOB_TYPES.BACKUP_RESTORE, {
				backupId: 7,
				environmentId: 3,
				jobExecutionId: 15,
			});

			await expect(processor.process(job)).rejects.toThrow(
				'Backup file not found on GDrive',
			);

			const execUpdateCallsWithFailed = (
				prisma.jobExecution.update as jest.Mock
			).mock.calls.filter((call: [any]) => call[0]?.data?.status === 'failed');
			expect(execUpdateCallsWithFailed.length).toBeGreaterThan(0);
		});

		it('does NOT update backup row on restore failures (no backupId write on restore path)', async () => {
			jest
				.spyOn(processor as any, 'handleRestore')
				.mockRejectedValue(new Error('Download failed'));

			const job = makeJob(JOB_TYPES.BACKUP_RESTORE, {
				backupId: 7,
				environmentId: 3,
				jobExecutionId: 15,
			});

			await expect(processor.process(job)).rejects.toThrow();

			// isRestore=true so the backup update branch (guarded by !isRestore)
			// must NOT be called with a 'failed' status
			const backupFailedUpdates = (
				prisma.backup.update as jest.Mock
			).mock.calls.filter((call: [any]) => call[0]?.data?.status === 'failed');
			expect(backupFailedUpdates).toHaveLength(0);
		});
	});

	// ── handleDelete ─────────────────────────────────────────────────────────

	describe('handleDelete', () => {
		it('calls rclone.deleteFile with the given path', async () => {
			(rclone as any).deleteFile = jest.fn().mockResolvedValue(undefined);
			const job = makeJob(JOB_TYPES.BACKUP_DELETE_FILE, {
				filePath: 'backups/old.tar.gz',
			});
			await processor.process(job);
			// handleDelete is called — verify via the delete mock
			expect((rclone as any).deleteFile).toHaveBeenCalledWith(
				'backups/old.tar.gz',
			);
		});
	});
});
