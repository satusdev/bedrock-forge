import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { SyncProcessor } from './sync.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { RcloneService } from '../../services/rclone.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePrisma() {
	return {
		jobExecution: {
			update: jest.fn().mockResolvedValue({}),
		},
		environment: {
			findUniqueOrThrow: jest.fn(),
		},
		appSetting: {
			findUnique: jest.fn().mockResolvedValue(null),
		},
	};
}

function makeSshKey() {
	return {
		resolvePrivateKey: jest
			.fn()
			.mockResolvedValue('-----BEGIN PRIVATE KEY-----'),
	};
}

function makeRclone() {
	return {
		writeConfig: jest.fn().mockResolvedValue(true),
		uploadFile: jest.fn().mockResolvedValue(undefined),
		downloadFile: jest.fn().mockResolvedValue(undefined),
	};
}

function makeEncryption() {
	return {
		decrypt: jest.fn().mockReturnValue('decrypted-value'),
		encrypt: jest.fn().mockReturnValue('encrypted-value'),
	};
}

function makeQueue() {
	return {
		add: jest.fn().mockResolvedValue({ id: 'job-id' }),
		client: Promise.resolve({ get: jest.fn().mockResolvedValue(null) }),
	};
}

function makeJob(name: string, data: object) {
	return {
		id: 'sync-job-001',
		name,
		data,
		updateProgress: jest.fn(),
	} as any;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SyncProcessor', () => {
	let processor: SyncProcessor;
	let prisma: ReturnType<typeof makePrisma>;

	beforeEach(async () => {
		prisma = makePrisma();

		const module = await Test.createTestingModule({
			providers: [
				SyncProcessor,
				{ provide: PrismaService, useValue: prisma },
				{ provide: SshKeyService, useValue: makeSshKey() },
				{ provide: RcloneService, useValue: makeRclone() },
				{ provide: EncryptionService, useValue: makeEncryption() },
				{ provide: getQueueToken(QUEUES.SYNC), useValue: makeQueue() },
			],
		}).compile();

		processor = module.get(SyncProcessor);
	});

	// ── process() routing ────────────────────────────────────────────────────

	describe('process() routing', () => {
		it('always marks jobExecution active on start', async () => {
			const processClone = jest
				.spyOn(processor as any, 'processClone')
				.mockResolvedValue(undefined);

			const job = makeJob(JOB_TYPES.SYNC_CLONE, {
				jobExecutionId: 42,
				sourceEnvironmentId: 1,
				targetEnvironmentId: 2,
			});
			await processor.process(job);

			expect(prisma.jobExecution.update).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { id: BigInt(42) },
					data: expect.objectContaining({ status: 'active' }),
				}),
			);
			expect(processClone).toHaveBeenCalledWith(job);
		});

		it('routes sync:clone to processClone', async () => {
			const processClone = jest
				.spyOn(processor as any, 'processClone')
				.mockResolvedValue(undefined);
			const processPush = jest
				.spyOn(processor as any, 'processPush')
				.mockResolvedValue(undefined);

			const job = makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 1 });
			await processor.process(job);

			expect(processClone).toHaveBeenCalledTimes(1);
			expect(processPush).not.toHaveBeenCalled();
		});

		it('routes sync:push to processPush', async () => {
			const processClone = jest
				.spyOn(processor as any, 'processClone')
				.mockResolvedValue(undefined);
			const processPush = jest
				.spyOn(processor as any, 'processPush')
				.mockResolvedValue(undefined);

			const job = makeJob(JOB_TYPES.SYNC_PUSH, { jobExecutionId: 2 });
			await processor.process(job);

			expect(processPush).toHaveBeenCalledTimes(1);
			expect(processClone).not.toHaveBeenCalled();
		});

		it('marks jobExecution completed when processClone succeeds', async () => {
			jest.spyOn(processor as any, 'processClone').mockResolvedValue(undefined);

			const job = makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 10 });
			await processor.process(job);

			const completedUpdate = (
				prisma.jobExecution.update as jest.Mock
			).mock.calls.find((c: [any]) => c[0].data.status === 'completed');
			expect(completedUpdate).toBeDefined();
			expect(completedUpdate[0].where.id).toEqual(BigInt(10));
		});
	});

	// ── Error handling ────────────────────────────────────────────────────────

	describe('process() error handling', () => {
		it('marks jobExecution as failed when processClone throws', async () => {
			jest
				.spyOn(processor as any, 'processClone')
				.mockRejectedValue(new Error('DB connection refused'));

			const job = makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 15 });

			await expect(processor.process(job)).rejects.toThrow(
				'DB connection refused',
			);

			const failedUpdate = (
				prisma.jobExecution.update as jest.Mock
			).mock.calls.find((c: [any]) => c[0].data.status === 'failed');
			expect(failedUpdate).toBeDefined();
			expect(failedUpdate[0].data.last_error).toBe('DB connection refused');
			expect(failedUpdate[0].where.id).toEqual(BigInt(15));
		});

		it('marks jobExecution as failed when processPush throws', async () => {
			jest
				.spyOn(processor as any, 'processPush')
				.mockRejectedValue(new Error('rsync failed'));

			const job = makeJob(JOB_TYPES.SYNC_PUSH, { jobExecutionId: 20 });

			await expect(processor.process(job)).rejects.toThrow('rsync failed');

			const failedUpdate = (
				prisma.jobExecution.update as jest.Mock
			).mock.calls.find((c: [any]) => c[0].data.status === 'failed');
			expect(failedUpdate).toBeDefined();
			expect(failedUpdate[0].data.last_error).toBe('rsync failed');
		});

		it('rethrows the original error after marking as failed', async () => {
			const originalError = new Error('SFTP timeout');
			jest
				.spyOn(processor as any, 'processClone')
				.mockRejectedValue(originalError);

			const job = makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 5 });

			await expect(processor.process(job)).rejects.toBe(originalError);
		});
	});

	// ── validateUrlReplacement ─────────────────────────────────────────────────

	describe('validateUrlReplacement()', () => {
		function makeExecutor({
			optionsOutput = '',
			postsOutput = '',
			postmetaOutput = '',
			queryCode = 0,
		}: {
			optionsOutput?: string;
			postsOutput?: string;
			postmetaOutput?: string;
			queryCode?: number;
		} = {}) {
			return {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('chmod') || cmd.includes('rm -f'))
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					if (cmd.includes('information_schema'))
						return Promise.resolve({ code: 0, stdout: 'wp_', stderr: '' });
					if (cmd.includes('FROM `wp_options`'))
						return Promise.resolve({
							code: queryCode,
							stdout: optionsOutput,
							stderr: '',
						});
					if (cmd.includes('FROM `wp_posts`'))
						return Promise.resolve({
							code: queryCode,
							stdout: postsOutput,
							stderr: '',
						});
					if (cmd.includes('FROM `wp_postmeta`'))
						return Promise.resolve({
							code: queryCode,
							stdout: postmetaOutput,
							stderr: '',
						});
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
		}

		function makeTracker() {
			return { track: jest.fn().mockResolvedValue(undefined) } as any;
		}

		const creds = {
			dbHost: 'localhost',
			dbUser: 'user',
			dbPassword: 'pass',
			dbName: 'testdb',
		};
		const sourceUrl = 'https://staging.example.com';
		const targetUrl = 'https://example.com';

		it('resolves cleanly when options, posts, and postmeta do not contain the source URL', async () => {
			const executor = makeExecutor();
			const tracker = makeTracker();

			await expect(
				(processor as any).validateUrlReplacement(
					executor,
					creds,
					sourceUrl,
					targetUrl,
					tracker,
				),
			).resolves.toBeUndefined();

			expect(tracker.track).toHaveBeenCalledWith(
				expect.objectContaining({
					step: expect.stringContaining('no stale source URLs remain'),
				}),
			);
		});

		it('throws when options still contain the source URL', async () => {
			const executor = makeExecutor({
				optionsOutput:
					'options\tsiteurl\thttps://staging.example.com\noptions\thome\thttps://example.com',
			});
			const tracker = makeTracker();

			await expect(
				(processor as any).validateUrlReplacement(
					executor,
					creds,
					sourceUrl,
					targetUrl,
					tracker,
				),
			).rejects.toThrow('URL replacement did not complete');
		});

		it('throws when posts still contain the source URL', async () => {
			const executor = makeExecutor({
				postsOutput:
					'posts\t42:page\t<a href="https://staging.example.com/foo">Button</a>',
			});
			const tracker = makeTracker();

			await expect(
				(processor as any).validateUrlReplacement(
					executor,
					creds,
					sourceUrl,
					targetUrl,
					tracker,
				),
			).rejects.toThrow('URL replacement did not complete');
		});

		it('throws when postmeta still contains the source URL', async () => {
			const executor = makeExecutor({
				postmetaOutput:
					'postmeta\t42:_elementor_data\t{"link":"https://staging.example.com/product"}',
			});
			const tracker = makeTracker();

			await expect(
				(processor as any).validateUrlReplacement(
					executor,
					creds,
					sourceUrl,
					targetUrl,
					tracker,
				),
			).rejects.toThrow('URL replacement did not complete');
		});

		it('logs a warning (does not throw) when the DB query itself fails', async () => {
			const executor = makeExecutor({ queryCode: 1 });
			const tracker = makeTracker();

			await expect(
				(processor as any).validateUrlReplacement(
					executor,
					creds,
					sourceUrl,
					targetUrl,
					tracker,
				),
			).resolves.toBeUndefined();
		});

		it('passes validation when only elementor_log (non-functional log option) contains the source URL', async () => {
			// The SQL built by validateUrlReplacement must exclude elementor_log.
			// The makeExecutor mock returns optionsOutput only when the cmd includes
			// `FROM \`wp_options\`` — the exclusion is in the same SQL string, so the
			// options mock returns empty (simulating that excluded rows are filtered out).
			const executor = makeExecutor({ optionsOutput: '' });
			const tracker = makeTracker();

			await expect(
				(processor as any).validateUrlReplacement(
					executor,
					creds,
					sourceUrl,
					targetUrl,
					tracker,
				),
			).resolves.toBeUndefined();

			// Verify the generated SQL contains the elementor_log exclusion.
			const sqlCall = (executor.execute as jest.Mock).mock.calls.find(
				([cmd]: [string]) =>
					cmd.includes('FROM `wp_options`') && cmd.includes('NOT IN'),
			);
			expect(sqlCall).toBeDefined();
			expect(sqlCall![0]).toContain('elementor_log');
			expect(sqlCall![0]).toContain('_transient_');
		});

		it('skips validation probes for protected core tables', async () => {
			const executor = makeExecutor({
				postsOutput:
					'posts\t42:page\t<a href="https://staging.example.com/foo">Button</a>',
			});
			const tracker = makeTracker();

			await expect(
				(processor as any).validateUrlReplacement(
					executor,
					creds,
					sourceUrl,
					targetUrl,
					tracker,
					['wp_posts'],
				),
			).resolves.toBeUndefined();

			expect(
				(executor.execute as jest.Mock).mock.calls.some(([cmd]: [string]) =>
					cmd.includes('FROM `wp_posts`'),
				),
			).toBe(false);
		});
	});

	// ── replaceUrlsInFiles integrity ───────────────────────────────────────────

	describe('replaceUrlsInFiles()', () => {
		function makeExecutorForFiles({
			sedExitCode,
			grepCode = 1,
			grepOutput = '',
		}: {
			sedExitCode: number;
			grepCode?: number;
			grepOutput?: string;
		}) {
			return {
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('test -d'))
						return Promise.resolve({ code: 0, stdout: 'ok', stderr: '' });
					if (cmd.includes('grep -nHF -m 1'))
						return Promise.resolve({
							code: grepCode,
							stdout: grepOutput,
							stderr: grepCode > 1 ? 'grep failed' : '',
						});
					return Promise.resolve({
						code: sedExitCode,
						stdout: '',
						stderr: sedExitCode !== 0 ? 'permission denied' : '',
					});
				}),
			};
		}

		it('resolves when all sed replacements succeed', async () => {
			const executor = makeExecutorForFiles({ sedExitCode: 0 });
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;

			await expect(
				(processor as any).replaceUrlsInFiles(
					'https://staging.example.com',
					'https://example.com',
					'/var/www/html/wp-content',
					executor,
					tracker,
					makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 1 }),
				),
			).resolves.toBeUndefined();
		});

		it('throws when any sed replacement fails', async () => {
			const executor = makeExecutorForFiles({ sedExitCode: 1 });
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;

			await expect(
				(processor as any).replaceUrlsInFiles(
					'https://staging.example.com',
					'https://example.com',
					'/var/www/html/wp-content',
					executor,
					tracker,
					makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 1 }),
				),
			).rejects.toThrow('File URL replacement failed');
		});

		it('throws when stale source URLs remain in text assets after sed', async () => {
			const executor = makeExecutorForFiles({
				sedExitCode: 0,
				grepCode: 0,
				grepOutput:
					'/var/www/html/wp-content/cache/file.css:12:https://staging.example.com/banner',
			});
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;

			await expect(
				(processor as any).replaceUrlsInFiles(
					'https://staging.example.com',
					'https://example.com',
					'/var/www/html/wp-content',
					executor,
					tracker,
					makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 1 }),
				),
			).rejects.toThrow('File URL replacement did not complete');
		});
	});

	// ── rsync file push handling ──────────────────────────────────────────────

	describe('pushFilesViaRsync()', () => {
		function makeRsyncArgs(result: {
			code: number;
			stdout?: string;
			stderr?: string;
		}) {
			const sourceExecutor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.startsWith('chmod ') || cmd.startsWith('rm -f ')) {
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					}
					if (cmd.startsWith('rsync ')) {
						return Promise.resolve({
							stdout: '',
							stderr: '',
							...result,
						});
					}
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = {
				track: jest.fn().mockResolvedValue(undefined),
				trackCommand: jest.fn().mockResolvedValue(undefined),
			};
			const targetEnv = {
				server: {
					ip_address: '203.0.113.10',
					ssh_port: 22,
					ssh_user: 'target-user',
					name: 'target',
					ssh_private_key_encrypted: null,
				},
			};

			return { sourceExecutor, tracker, targetEnv };
		}

		it('disables permission reconciliation for rsync transfers', async () => {
			const { sourceExecutor, tracker, targetEnv } = makeRsyncArgs({
				code: 0,
			});

			await (processor as any).pushFilesViaRsync(
				makeJob(JOB_TYPES.SYNC_PUSH, { jobExecutionId: 1 }),
				'/source/site',
				'/target/site',
				targetEnv,
				sourceExecutor,
				tracker,
			);

			const rsyncCall = (sourceExecutor.execute as jest.Mock).mock.calls
				.map(([cmd]) => String(cmd))
				.find(cmd => cmd.startsWith('rsync '));
			expect(rsyncCall).toContain('--no-perms');
			expect(rsyncCall).toContain('--no-owner');
			expect(rsyncCall).toContain('--no-group');
		});

		it('excludes protected upload files from rsync transfer and deletion', async () => {
			const { sourceExecutor, tracker, targetEnv } = makeRsyncArgs({
				code: 0,
			});

			await (processor as any).pushFilesViaRsync(
				makeJob(JOB_TYPES.SYNC_PUSH, { jobExecutionId: 1 }),
				'/source/site',
				'/target/site',
				targetEnv,
				sourceExecutor,
				tracker,
				['web/app/uploads/2026/01/project.jpg'],
			);

			const rsyncCall = (sourceExecutor.execute as jest.Mock).mock.calls
				.map(([cmd]) => String(cmd))
				.find(cmd => cmd.startsWith('rsync '));
			expect(rsyncCall).toContain(
				"--exclude='/web/app/uploads/2026/01/project.jpg'",
			);
		});

		it('treats rsync code 23 as non-fatal when output is permission-only', async () => {
			const { sourceExecutor, tracker, targetEnv } = makeRsyncArgs({
				code: 23,
				stderr:
					'rsync: [generator] failed to set permissions on "/target/web/wp-config.php": Operation not permitted (1)\n' +
					'rsync error: some files/attrs were not transferred (see previous errors) (code 23)',
			});

			await expect(
				(processor as any).pushFilesViaRsync(
					makeJob(JOB_TYPES.SYNC_PUSH, { jobExecutionId: 1 }),
					'/source/site',
					'/target/site',
					targetEnv,
					sourceExecutor,
					tracker,
				),
			).resolves.toBeUndefined();

			expect(tracker.track).toHaveBeenCalledWith(
				expect.objectContaining({
					step: expect.stringContaining('some attrs skipped'),
					level: 'warn',
				}),
			);
		});

		it('fails rsync code 23 when output contains real transfer errors', async () => {
			const { sourceExecutor, tracker, targetEnv } = makeRsyncArgs({
				code: 23,
				stderr:
					'rsync: [sender] send_files failed to open "/source/site/web/app/plugins/plugin.php": Permission denied (13)\n' +
					'rsync error: some files/attrs were not transferred (see previous errors) (code 23)',
			});

			await expect(
				(processor as any).pushFilesViaRsync(
					makeJob(JOB_TYPES.SYNC_PUSH, { jobExecutionId: 1 }),
					'/source/site',
					'/target/site',
					targetEnv,
					sourceExecutor,
					tracker,
				),
			).rejects.toThrow('rsync failed (exit 23)');
		});
	});

	// ── flushWordPressCaches fallback cleanup ─────────────────────────────────

	describe('flushWordPressCaches() fallback cleanup', () => {
		it('removes LiteSpeed-style cache directories when WP-CLI is unavailable', async () => {
			const executor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('wp cache flush')) {
						return Promise.resolve({
							code: 1,
							stdout: '',
							stderr: 'missing mysqli',
						});
					}
					if (cmd.includes('information_schema'))
						return Promise.resolve({ code: 0, stdout: 'wp_', stderr: '' });
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;
			const creds = {
				dbHost: 'localhost',
				dbUser: 'user',
				dbPassword: 'pass',
				dbName: 'testdb',
			};
			const layout = {
				corePath: '/var/www/html/web/wp',
				contentPath: '/var/www/html/web/app',
				isBedrock: true,
			};

			await expect(
				(processor as any).flushWordPressCaches(
					executor,
					creds,
					layout,
					tracker,
					'Push',
					false,
				),
			).resolves.toBeUndefined();

			expect(
				(executor.execute as jest.Mock).mock.calls.some(([cmd]) =>
					String(cmd).includes('/litespeed'),
				),
			).toBe(true);
		});

		it('calls lsphp phar directly when LiteSpeed PHP binary and wp path are detected', async () => {
			const executor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('plugin is-active elementor'))
						return Promise.resolve({
							code: 1,
							stdout: '',
							stderr: 'Plugin is not active.',
						});
					if (cmd.includes('stat -c'))
						return Promise.resolve({
							code: 0,
							stdout: 'siteowner',
							stderr: '',
						});
					if (cmd.includes('lsws/lsphp'))
						return Promise.resolve({
							code: 0,
							stdout: '/usr/local/lsws/lsphp81/bin/php',
							stderr: '',
						});
					if (cmd.includes('which wp'))
						return Promise.resolve({
							code: 0,
							stdout: '/usr/local/bin/wp',
							stderr: '',
						});
					// wp cache flush succeeds with lsphp direct phar call
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;
			const creds = {
				dbHost: 'localhost',
				dbUser: 'user',
				dbPassword: 'pass',
				dbName: 'testdb',
			};
			const layout = {
				corePath: '/var/www/html/web/wp',
				contentPath: '/var/www/html/web/app',
				isBedrock: true,
			};

			await (processor as any).flushWordPressCaches(
				executor,
				creds,
				layout,
				tracker,
				'Push',
				false,
			);

			// Should use direct phar call: lsphp81/bin/php /usr/local/bin/wp ...
			// NOT env WP_CLI_PHP= (which is silently ignored by phar shebang)
			const calls = (executor.execute as jest.Mock).mock.calls.map(([c]) =>
				String(c),
			);
			const wpCacheFlushCall = calls.find(c => c.includes('cache flush'));
			expect(wpCacheFlushCall).toBeDefined();
			expect(wpCacheFlushCall).toContain('lsphp81/bin/php');
			expect(wpCacheFlushCall).toContain('/usr/local/bin/wp');
			expect(wpCacheFlushCall).not.toContain('env WP_CLI_PHP=');
		});

		it('skips Elementor CSS flush when Elementor is not active', async () => {
			const executor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('plugin is-active elementor'))
						return Promise.resolve({
							code: 1,
							stdout: '',
							stderr: 'Plugin is not active.',
						});
					if (cmd.includes('stat -c'))
						return Promise.resolve({
							code: 0,
							stdout: 'siteowner',
							stderr: '',
						});
					if (cmd.includes('lsws/lsphp'))
						return Promise.resolve({
							code: 0,
							stdout: '/usr/local/lsws/lsphp81/bin/php',
							stderr: '',
						});
					if (cmd.includes('which wp'))
						return Promise.resolve({
							code: 0,
							stdout: '/usr/local/bin/wp',
							stderr: '',
						});
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;
			const creds = {
				dbHost: 'localhost',
				dbUser: 'user',
				dbPassword: 'pass',
				dbName: 'testdb',
			};
			const layout = {
				corePath: '/var/www/html/web/wp',
				contentPath: '/var/www/html/web/app',
				isBedrock: true,
			};

			await (processor as any).flushWordPressCaches(
				executor,
				creds,
				layout,
				tracker,
				'Clone',
				false,
			);

			const calls = (executor.execute as jest.Mock).mock.calls.map(([cmd]) =>
				String(cmd),
			);
			expect(calls.some(cmd => cmd.includes('elementor flush-css'))).toBe(false);
			expect(tracker.track).toHaveBeenCalledWith(
				expect.objectContaining({
					step: 'Clone: Elementor CSS flush skipped',
					level: 'info',
				}),
			);
		});

		it('resets Elementor CSS cache when active Elementor CLI flush fails', async () => {
			const executor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('plugin is-active elementor'))
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					if (cmd.includes('elementor flush-css'))
						return Promise.resolve({
							code: 1,
							stdout: '',
							stderr: 'Elementor CLI failed',
						});
					if (cmd.includes('stat -c'))
						return Promise.resolve({
							code: 0,
							stdout: 'siteowner',
							stderr: '',
						});
					if (cmd.includes('lsws/lsphp'))
						return Promise.resolve({
							code: 0,
							stdout: '/usr/local/lsws/lsphp81/bin/php',
							stderr: '',
						});
					if (cmd.includes('which wp'))
						return Promise.resolve({
							code: 0,
							stdout: '/usr/local/bin/wp',
							stderr: '',
						});
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;
			const creds = {
				dbHost: 'localhost',
				dbUser: 'user',
				dbPassword: 'pass',
				dbName: 'testdb',
			};
			const layout = {
				corePath: '/var/www/html/web/wp',
				contentPath: '/var/www/html/web/app',
				isBedrock: true,
			};

			await (processor as any).flushWordPressCaches(
				executor,
				creds,
				layout,
				tracker,
				'Clone',
				false,
			);

			const calls = (executor.execute as jest.Mock).mock.calls.map(([cmd]) =>
				String(cmd),
			);
			expect(calls.some(cmd => cmd.includes('elementor flush-css'))).toBe(true);
			expect(
				calls.some(cmd => cmd.includes('/uploads/elementor/css')),
			).toBe(true);
			expect(tracker.track).toHaveBeenCalledWith(
				expect.objectContaining({
					step: 'Clone: Elementor CSS cache reset for auto-regeneration',
					level: 'warn',
				}),
			);
		});

		it('removes WordPress object cache drop-in when WP-CLI is unavailable', async () => {
			const executor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('wp cache flush'))
						return Promise.resolve({
							code: 1,
							stdout: '',
							stderr: 'missing mysqli',
						});
					if (cmd.includes('information_schema'))
						return Promise.resolve({ code: 0, stdout: 'wp_', stderr: '' });
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;
			const creds = {
				dbHost: 'localhost',
				dbUser: 'user',
				dbPassword: 'pass',
				dbName: 'testdb',
			};
			const layout = {
				corePath: '/var/www/html/web/wp',
				contentPath: '/var/www/html/web/app',
				isBedrock: true,
			};

			await (processor as any).flushWordPressCaches(
				executor,
				creds,
				layout,
				tracker,
				'Push',
				false,
			);

			expect(
				(executor.execute as jest.Mock).mock.calls.some(([cmd]) =>
					String(cmd).includes('/object-cache.php'),
				),
			).toBe(true);
		});

		it('sends HTTP PURGE to siteUrl when WP-CLI is unavailable', async () => {
			const executor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('wp cache flush'))
						return Promise.resolve({
							code: 1,
							stdout: '',
							stderr: 'missing mysqli',
						});
					if (cmd.includes('information_schema'))
						return Promise.resolve({ code: 0, stdout: 'wp_', stderr: '' });
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;
			const creds = {
				dbHost: 'localhost',
				dbUser: 'user',
				dbPassword: 'pass',
				dbName: 'testdb',
			};
			const layout = {
				corePath: '/var/www/html/web/wp',
				contentPath: '/var/www/html/web/app',
				isBedrock: true,
			};

			await (processor as any).flushWordPressCaches(
				executor,
				creds,
				layout,
				tracker,
				'Push',
				false,
				'https://lamah.com',
			);

			expect(
				(executor.execute as jest.Mock).mock.calls.some(([cmd]) =>
					String(cmd).includes('-X PURGE'),
				),
			).toBe(true);
		});
	});

	// ── runUrlSearchReplace WP-CLI partial success ─────────────────────────────

	describe('runUrlSearchReplace() WP-CLI partial-success guard', () => {
		it('falls through to PHP/SQL when WP-CLI succeeds for pair 0 but fails for pair 1', async () => {
			// Pair 0 = plain URL, Pair 1 = json-escaped (https:\/\/...) variant
			// WP-CLI succeeds for pair 0 but fails for pair 1 in both modes.
			// Expected: PHP fallback is attempted for all pairs.
			let wpCliCallCount = 0;
			const phpCalls: string[] = [];

			const executor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('stat ') || cmd.includes('id ')) {
						// buildWpCliPrefix probe — no sudo
						return Promise.resolve({ code: 1, stdout: '', stderr: '' });
					}
					if (
						cmd.includes('search-replace') &&
						!cmd.includes('forge_sr_')
					) {
						wpCliCallCount++;
						// Succeed for pair 0 (plain URL), fail for pair 1 (escaped URL)
						const succeeds = wpCliCallCount % 2 === 1;
						return Promise.resolve({
							code: succeeds ? 0 : 1,
							stdout: 'Done',
							stderr: '',
						});
					}
					if (cmd.includes('php ') && cmd.includes('forge_sr_')) {
						phpCalls.push(cmd);
						return Promise.resolve({
							code: 0,
							stdout: JSON.stringify({
								tables_scanned: 5,
								rows_affected: 2,
								errors: [],
							}),
							stderr: '',
						});
					}
					if (cmd.includes('information_schema') || cmd.includes('%options')) {
						return Promise.resolve({ code: 0, stdout: 'wp_', stderr: '' });
					}
					if (cmd.includes('chmod') || cmd.includes('rm -f')) {
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					}
					// readFile for search-replace.php is not mocked here — the private method
					// uses fs.readFile. Skip by returning zero for any remaining calls.
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};

			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;
			const creds = {
				dbHost: 'localhost',
				dbUser: 'u',
				dbPassword: 'p',
				dbName: 'db',
			};

			// We are testing that WP-CLI partial success does NOT short-circuit.
			// The PHP fallback path uses fs.readFile for search-replace.php — mock it.
			const originalReadFile = require('fs/promises').readFile;
			jest
				.spyOn(require('fs/promises'), 'readFile')
				.mockResolvedValue(
					Buffer.from(
						'<?php echo json_encode(["tables_scanned"=>1,"rows_affected"=>1,"errors"=>[]]);',
					),
				);

			try {
				await (processor as any).runUrlSearchReplace(
					'https://staging.example.com',
					'https://example.com',
					executor,
					creds,
					'/var/www/html',
					tracker,
					makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 1 }),
					'sync',
					['wp_posts', 'wp_ct_registrations'],
				);
			} finally {
				jest.spyOn(require('fs/promises'), 'readFile').mockRestore();
			}

			// When WP-CLI partially fails, the PHP strategy should have been invoked.
			expect(phpCalls.length).toBeGreaterThan(0);
			expect(phpCalls[0]).toContain(
				"--skip-tables='wp_posts,wp_ct_registrations'",
			);
		});

		it('adds protected tables to successful WP-CLI search-replace commands', async () => {
			const executor = {
				pushFile: jest.fn().mockResolvedValue(undefined),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('stat ') || cmd.includes('id ')) {
						return Promise.resolve({ code: 1, stdout: '', stderr: '' });
					}
					if (cmd.includes('search-replace') && !cmd.includes('forge_sr_')) {
						return Promise.resolve({ code: 0, stdout: 'Done', stderr: '' });
					}
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = { track: jest.fn().mockResolvedValue(undefined) } as any;

			await (processor as any).runUrlSearchReplace(
				'https://staging.example.com',
				'https://example.com',
				executor,
				{
					dbHost: 'localhost',
					dbUser: 'u',
					dbPassword: 'p',
					dbName: 'db',
				},
				'/var/www/html',
				tracker,
				makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 1 }),
				'sync',
				['wp_posts', 'wp_ct_registrations'],
			);

			const commands = (executor.execute as jest.Mock).mock.calls
				.map(([cmd]) => String(cmd))
				.join('\n');
			expect(commands).toContain('search-replace');
			expect(commands).toContain(
				"--skip-tables='wp_posts,wp_ct_registrations'",
			);
		});

		it('does not generate SQL fallback updates for protected core tables', async () => {
			let pushedSql = '';
			const executor = {
				pushFile: jest.fn().mockImplementation(({ remotePath, content }) => {
					if (remotePath.includes('_sql_')) {
						pushedSql = Buffer.isBuffer(content)
							? content.toString('utf8')
							: String(content);
					}
					return Promise.resolve(undefined);
				}),
				execute: jest.fn().mockImplementation((cmd: string) => {
					if (cmd.includes('stat ') || cmd.includes('id ')) {
						return Promise.resolve({ code: 1, stdout: '', stderr: '' });
					}
					if (
						cmd.includes('search-replace') &&
						!cmd.includes('forge_sr_')
					) {
						return Promise.resolve({ code: 1, stdout: '', stderr: 'wp failed' });
					}
					if (cmd.includes('information_schema') || cmd.includes('%options')) {
						return Promise.resolve({ code: 0, stdout: 'wp_', stderr: '' });
					}
					if (cmd.includes('php ') && cmd.includes('forge_sr_')) {
						return Promise.resolve({ code: 1, stdout: '', stderr: 'php failed' });
					}
					return Promise.resolve({ code: 0, stdout: '', stderr: '' });
				}),
			};
			const tracker = { track: jest.fn().mockResolvedValue(undefined), trackCommand: jest.fn().mockResolvedValue(undefined) } as any;
			const creds = {
				dbHost: 'localhost',
				dbUser: 'u',
				dbPassword: 'p',
				dbName: 'db',
			};

			jest
				.spyOn(require('fs/promises'), 'readFile')
				.mockResolvedValue(Buffer.from('<?php echo "fail";'));

			try {
				await (processor as any).runUrlSearchReplace(
					'https://staging.example.com',
					'https://example.com',
					executor,
					creds,
					'/var/www/html',
					tracker,
					makeJob(JOB_TYPES.SYNC_CLONE, { jobExecutionId: 1 }),
					'sync',
					['wp_posts'],
				);
			} finally {
				jest.spyOn(require('fs/promises'), 'readFile').mockRestore();
			}

			expect(pushedSql).toContain('UPDATE `wp_options`');
			expect(pushedSql).not.toContain('UPDATE `wp_posts`');
		});
	});

	// ── backupProtectedPostTypes & restoreProtectedPostTypes ──────────────────

	describe('backup/restore protected post types', () => {
		const creds = {
			dbHost: 'localhost',
			dbUser: 'u',
			dbPassword: 'p',
			dbName: 'db',
		};
		const postTypes = ['course', 'lesson'];
		const tgtMycnf = '/tmp/my.cnf';

		it('extracts original and generated upload paths from attachment metadata', () => {
			const output = [
				'10\t_wp_attached_file\t2026/01/project.jpg',
				'10\t_wp_attachment_metadata\ta:2:{s:4:"file";s:19:"2026/01/project.jpg";s:5:"sizes";a:1:{s:9:"thumbnail";a:1:{s:4:"file";s:21:"project-150x150.jpg";}}}',
			].join('\n');

			expect((processor as any).extractProtectedUploadPaths(output)).toEqual([
				'2026/01/project.jpg',
				'2026/01/project-150x150.jpg',
			]);
		});

		describe('backupProtectedPostTypes', () => {
			it('returns null if postTypes list is empty', async () => {
				const executor = { execute: jest.fn() } as any;
				const tracker = { track: jest.fn() } as any;
				const res = await (processor as any).backupProtectedPostTypes(
					executor,
					creds,
					tgtMycnf,
					[],
					tracker,
				);
				expect(res).toBeNull();
			});

			it('returns null if posts table does not exist', async () => {
				const executor = {
					execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
				} as any;
				const tracker = { track: jest.fn() } as any;
				const res = await (processor as any).backupProtectedPostTypes(
					executor,
					creds,
					tgtMycnf,
					postTypes,
					tracker,
				);
				expect(res).toBeNull();
				expect(tracker.track).toHaveBeenCalledWith(
					expect.objectContaining({
						step: expect.stringContaining('posts table does not exist'),
					}),
				);
			});

			it('returns prefix and skips backup if backup table already exists', async () => {
				const executor = {
					pushFile: jest.fn(),
					execute: jest.fn().mockImplementation((cmd: string) => {
						if (cmd.includes('SHOW TABLES') && cmd.includes('wp_posts')) {
							return Promise.resolve({ code: 0, stdout: 'wp_posts', stderr: '' });
						}
						if (cmd.includes('SHOW TABLES') && cmd.includes('wp_forge_backup_posts')) {
							return Promise.resolve({ code: 0, stdout: 'wp_forge_backup_posts', stderr: '' });
						}
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					}),
				} as any;
				const tracker = { track: jest.fn() } as any;
				const res = await (processor as any).backupProtectedPostTypes(
					executor,
					creds,
					tgtMycnf,
					postTypes,
					tracker,
				);
				expect(res).toEqual({ prefix: 'wp_', uploadPaths: [] });
				expect(executor.pushFile).not.toHaveBeenCalled();
				expect(tracker.track).toHaveBeenCalledWith(
					expect.objectContaining({
						step: expect.stringContaining('existing backup tables detected'),
					}),
				);
			});

			it('creates backup and returns prefix if backup table does not exist', async () => {
				let pushedSql = '';
				const executor = {
					pushFile: jest.fn().mockImplementation(({ content }) => {
						pushedSql = Buffer.isBuffer(content)
							? content.toString('utf8')
							: String(content);
						return Promise.resolve(undefined);
					}),
					execute: jest.fn().mockImplementation((cmd: string) => {
						if (cmd.includes('SHOW TABLES') && cmd.includes('wp_posts')) {
							return Promise.resolve({ code: 0, stdout: 'wp_posts', stderr: '' });
						}
						if (cmd.includes('SHOW TABLES') && cmd.includes('wp_forge_backup_posts')) {
							return Promise.resolve({ code: 0, stdout: '', stderr: '' });
						}
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					}),
				} as any;
				const tracker = { track: jest.fn() } as any;
				const res = await (processor as any).backupProtectedPostTypes(
					executor,
					creds,
					tgtMycnf,
					postTypes,
					tracker,
				);
				expect(res).toEqual({ prefix: 'wp_', uploadPaths: [] });
				expect(executor.pushFile).toHaveBeenCalled();
				expect(pushedSql).toContain("a.post_type = 'attachment'");
				expect(pushedSql).toContain('forge_backup_term_taxonomy');
				expect(pushedSql).toContain('forge_backup_terms');
				expect(tracker.track).toHaveBeenCalledWith(
					expect.objectContaining({
						step: expect.stringContaining('backing up target post types'),
					}),
				);
			});

			it('returns null if backup command fails', async () => {
				const executor = {
					pushFile: jest.fn().mockResolvedValue(undefined),
					execute: jest.fn().mockImplementation((cmd: string) => {
						if (cmd.includes('SHOW TABLES') && cmd.includes('wp_posts')) {
							return Promise.resolve({ code: 0, stdout: 'wp_posts', stderr: '' });
						}
						if (cmd.includes('SHOW TABLES') && cmd.includes('wp_forge_backup_posts')) {
							return Promise.resolve({ code: 0, stdout: '', stderr: '' });
						}
						if (cmd.includes('<') && cmd.includes('forge_post_type_backup_')) {
							return Promise.resolve({ code: 1, stdout: '', stderr: 'Access denied' });
						}
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					}),
				} as any;
				const tracker = { track: jest.fn() } as any;
				const res = await (processor as any).backupProtectedPostTypes(
					executor,
					creds,
					tgtMycnf,
					postTypes,
					tracker,
				);
				expect(res).toBeNull();
				expect(tracker.track).toHaveBeenCalledWith(
					expect.objectContaining({
						step: expect.stringContaining('backup failed'),
					}),
				);
			});
		});

		describe('restoreProtectedPostTypes', () => {
			it('skips restore if postTypes is empty', async () => {
				const executor = { execute: jest.fn() } as any;
				const tracker = { track: jest.fn() } as any;
				await (processor as any).restoreProtectedPostTypes(
					executor,
					creds,
					tgtMycnf,
					[],
					'wp_',
					tracker,
				);
				expect(executor.execute).not.toHaveBeenCalled();
			});

			it('skips restore if backup table does not exist', async () => {
				const executor = {
					execute: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
				} as any;
				const tracker = { track: jest.fn() } as any;
				await (processor as any).restoreProtectedPostTypes(
					executor,
					creds,
					tgtMycnf,
					postTypes,
					'wp_',
					tracker,
				);
				expect(executor.execute).toHaveBeenCalledTimes(1); // Only for check
			});

			it('performs restore and tracks success when query succeeds', async () => {
				let pushedSql = '';
				const executor = {
					pushFile: jest.fn().mockImplementation(({ content }) => {
						pushedSql = Buffer.isBuffer(content)
							? content.toString('utf8')
							: String(content);
						return Promise.resolve(undefined);
					}),
					execute: jest.fn().mockImplementation((cmd: string) => {
						if (cmd.includes('SHOW TABLES') && cmd.includes('wp_forge_backup_posts')) {
							return Promise.resolve({ code: 0, stdout: 'wp_forge_backup_posts', stderr: '' });
						}
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					}),
				} as any;
				const tracker = { track: jest.fn() } as any;
				await (processor as any).restoreProtectedPostTypes(
					executor,
					creds,
					tgtMycnf,
					postTypes,
					'wp_',
					tracker,
				);
				expect(executor.pushFile).toHaveBeenCalled();
				expect(pushedSql).toContain("a.post_type = 'attachment'");
				expect(pushedSql).toContain('ID IN (SELECT ID FROM `wp_forge_backup_posts`)');
				expect(pushedSql).toContain('REPLACE INTO `wp_terms`');
				expect(pushedSql).toContain('REPLACE INTO `wp_term_taxonomy`');
				expect(pushedSql).toContain('INSERT IGNORE INTO `wp_term_relationships`');
				expect(tracker.track).toHaveBeenCalledWith(
					expect.objectContaining({
						step: expect.stringContaining('restored successfully'),
					}),
				);
			});

			it('throws an error when restore query fails', async () => {
				const executor = {
					pushFile: jest.fn().mockResolvedValue(undefined),
					execute: jest.fn().mockImplementation((cmd: string) => {
						if (cmd.includes('SHOW TABLES') && cmd.includes('wp_forge_backup_posts')) {
							return Promise.resolve({ code: 0, stdout: 'wp_forge_backup_posts', stderr: '' });
						}
						if (cmd.includes('<') && cmd.includes('forge_post_type_restore_')) {
							return Promise.resolve({ code: 1, stdout: '', stderr: 'Restore error' });
						}
						return Promise.resolve({ code: 0, stdout: '', stderr: '' });
					}),
				} as any;
				const tracker = { track: jest.fn() } as any;
				await expect(
					(processor as any).restoreProtectedPostTypes(
						executor,
						creds,
						tgtMycnf,
						postTypes,
						'wp_',
						tracker,
					),
				).rejects.toThrow('restore failed: Restore error');
				expect(tracker.track).toHaveBeenCalledWith(
					expect.objectContaining({
						step: expect.stringContaining('restore failed'),
					}),
				);
			});
		});
	});
});
