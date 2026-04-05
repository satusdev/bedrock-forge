import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES, CreateBedrockPayload } from '@bedrock-forge/shared';
import { callCpApi, CpCreds, escapeMysql } from '../../utils/cyberpanel-http';
import { shellQuote, flipProtocol } from '../../utils/processor-utils';

// concurrency=1: Bedrock provisioning runs composer, git clone, SSH commands.
@Processor(QUEUES.PROJECTS, { concurrency: 1 })
export class CreateBedrockProcessor extends WorkerHost {
	private readonly logger = new Logger(CreateBedrockProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly sshKey: SshKeyService,
		private readonly encryption: EncryptionService,
	) {
		super();
	}

	async process(job: Job) {
		if (job.name !== JOB_TYPES.PROJECT_CREATE_BEDROCK) return;

		const data = job.data as CreateBedrockPayload;
		const { environmentId, jobExecutionId, cyberpanel, sourceEnvironmentId } =
			data;

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
		});

		const tempCleanup: Array<() => Promise<unknown>> = [];
		let websiteCreated = false;
		let cpCreds: CpCreds | null = null;
		let domain: string | null = null;

		try {
			const env = await this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(environmentId) },
				include: { server: true },
			});
			const server = env.server;

			const executor = createRemoteExecutor({
				host: server.ip_address,
				port: server.ssh_port,
				username: server.ssh_user,
				privateKey: await this.sshKey.resolvePrivateKey(server),
			});
			await job.updateProgress({ value: 5, step: 'Connected to server' });

			// ── 1. CyberPanel provisioning ───────────────────────────────────

			if (cyberpanel) {
				domain = cyberpanel.domain;

				if (server.cyberpanel_login) {
					const raw = this.encryption.decrypt(
						server.cyberpanel_login as string,
					);
					cpCreds = JSON.parse(raw) as CpCreds;
				} else {
					throw new Error('Server has no CyberPanel credentials configured');
				}

				this.logger.log(`Creating CyberPanel website for ${domain}`);
				await callCpApi(cpCreds, '/api/createWebsite', {
					domainName: domain,
					phpSelection: cyberpanel.phpVersion ?? '8.3',
					email: cyberpanel.adminEmail ?? 'admin@example.com',
					websiteOwner: cpCreds.username,
					package: 'Default',
					websiteOwnerEmail: cyberpanel.adminEmail ?? 'admin@example.com',
					ssl: 0,
					dkim: 0,
					openbasedir: 0,
				});
				websiteCreated = true;
				await job.updateProgress({
					value: 20,
					step: 'CyberPanel website created',
				});

				this.logger.log(`Creating database: ${cyberpanel.dbName}`);
				await callCpApi(cpCreds, '/api/submitDBCreation', {
					databaseWebsite: domain,
					dbName: cyberpanel.dbName,
					dbUsername: cyberpanel.dbUser,
					dbPassword: cyberpanel.dbPassword,
				});
				await job.updateProgress({ value: 30, step: 'Database created' });
			}

			// ── 2a. Clone mode ───────────────────────────────────────────────

			if (sourceEnvironmentId) {
				const srcEnv = await this.prisma.environment.findUniqueOrThrow({
					where: { id: BigInt(sourceEnvironmentId) },
					include: {
						server: true,
						wp_db_credentials: true,
					},
				});

				if (!srcEnv.wp_db_credentials) {
					throw new Error('Source environment has no DB credentials stored');
				}

				const sc = srcEnv.wp_db_credentials;
				const srcCreds = {
					dbName: this.encryption.decrypt(sc.db_name_encrypted),
					dbUser: this.encryption.decrypt(sc.db_user_encrypted),
					dbPassword: this.encryption.decrypt(sc.db_password_encrypted),
					dbHost: this.encryption.decrypt(sc.db_host_encrypted),
				};

				const srcExecutor = createRemoteExecutor({
					host: srcEnv.server.ip_address,
					port: srcEnv.server.ssh_port,
					username: srcEnv.server.ssh_user,
					privateKey: await this.sshKey.resolvePrivateKey(srcEnv.server),
				});

				await job.updateProgress({
					value: 35,
					step: 'Connected to source server',
				});

				// ── Dump source DB ──
				const dumpTmp = `/tmp/cb_clone_${job.id}.sql`;
				const srcMycnf = `/tmp/cb_src_${job.id}.cnf`;

				await srcExecutor.pushFile({
					remotePath: srcMycnf,
					content: Buffer.from(
						`[client]\nuser=${srcCreds.dbUser}\npassword=${srcCreds.dbPassword}\nhost=${srcCreds.dbHost}\n`,
					),
				});
				await srcExecutor.execute(`chmod 600 ${srcMycnf}`);
				tempCleanup.push(() =>
					srcExecutor.execute(`rm -f ${srcMycnf}`).catch(() => {}),
				);

				const dumpResult = await srcExecutor.execute(
					`mysqldump --defaults-extra-file=${srcMycnf} --single-transaction --quick ${shellQuote(srcCreds.dbName)} > ${dumpTmp}`,
				);
				await srcExecutor.execute(`rm -f ${srcMycnf}`).catch(() => {});

				if (dumpResult.code !== 0) {
					throw new Error(
						`mysqldump failed (exit ${dumpResult.code}): ${dumpResult.stderr}`,
					);
				}
				await job.updateProgress({ value: 50, step: 'Source database dumped' });

				// ── Transfer + import ──
				const dumpBuffer = await srcExecutor.pullFile(dumpTmp);
				await srcExecutor.execute(`rm -f ${dumpTmp}`);

				const dbName = cyberpanel?.dbName ?? srcCreds.dbName;
				const dbUser = cyberpanel?.dbUser ?? srcCreds.dbUser;
				const dbPassword = cyberpanel?.dbPassword ?? srcCreds.dbPassword;
				const dbHost = 'localhost';

				const tgtMycnf = `/tmp/cb_tgt_${job.id}.cnf`;
				await executor.pushFile({ remotePath: dumpTmp, content: dumpBuffer });
				await executor.pushFile({
					remotePath: tgtMycnf,
					content: Buffer.from(
						`[client]\nuser=${dbUser}\npassword=${dbPassword}\nhost=${dbHost}\n`,
					),
				});
				await executor.execute(`chmod 600 ${tgtMycnf}`);
				tempCleanup.push(() =>
					executor.execute(`rm -f ${tgtMycnf} ${dumpTmp}`).catch(() => {}),
				);

				const importResult = await executor.execute(
					`mysql --defaults-extra-file=${tgtMycnf} ${shellQuote(dbName)} < ${dumpTmp}`,
				);
				await executor.execute(`rm -f ${tgtMycnf} ${dumpTmp}`).catch(() => {});

				if (importResult.code !== 0) {
					throw new Error(
						`mysql import failed (exit ${importResult.code}): ${importResult.stderr}`,
					);
				}
				await job.updateProgress({ value: 60, step: 'Database imported' });

				// ── rsync files ──
				const srcPath = srcEnv.root_path?.replace(/\/+$/, '') ?? '';
				const tgtPath = env.root_path?.replace(/\/+$/, '') ?? '';

				if (srcPath && tgtPath && srcEnv.server.id === server.id) {
					// Same server — local rsync
					await executor.execute(
						`rsync -a --delete ${shellQuote(srcPath + '/')} ${shellQuote(tgtPath + '/')}`,
					);
				} else if (srcPath && tgtPath) {
					// Cross-server via tar pipe
					const srcKey = await this.sshKey.resolvePrivateKey(srcEnv.server);
					const keyTmp = `/tmp/cb_key_${job.id}`;
					await executor.pushFile({ remotePath: keyTmp, content: srcKey });
					await executor.execute(`chmod 600 ${keyTmp}`);
					tempCleanup.push(() =>
						executor.execute(`rm -f ${keyTmp}`).catch(() => {}),
					);

					await srcExecutor.execute(
						`tar -cz -C ${shellQuote(srcPath)} . | ssh -o StrictHostKeyChecking=no -i ${keyTmp} ${srcEnv.server.ssh_user}@${server.ip_address} "mkdir -p ${shellQuote(tgtPath)} && tar -xz -C ${shellQuote(tgtPath)}"`,
					);
					await executor.execute(`rm -f ${keyTmp}`).catch(() => {});
				}
				await job.updateProgress({ value: 70, step: 'Files synced' });

				// ── URL search-replace (SQL — zero wp-cli per PROJECT.md) ─────────────
				const srcUrl = srcEnv.url ?? null;
				const tgtUrl = env.url ?? null;

				if (srcUrl && tgtUrl && srcUrl !== tgtUrl) {
					const srMycnf = `/tmp/cb_sr_${job.id}.cnf`;
					const srSqlFile = `/tmp/cb_sr_${job.id}.sql`;
					await executor.pushFile({
						remotePath: srMycnf,
						content: Buffer.from(
							`[client]\nuser=${dbUser}\npassword=${dbPassword}\nhost=localhost\n`,
						),
					});
					await executor.execute(`chmod 600 ${srMycnf}`);
					tempCleanup.push(() =>
						executor.execute(`rm -f ${srMycnf} ${srSqlFile}`).catch(() => {}),
					);

					const pairs: Array<[string, string]> = [[srcUrl, tgtUrl]];
					const alt = flipProtocol(srcUrl);
					const altTgt = flipProtocol(tgtUrl);
					if (alt && altTgt && alt !== tgtUrl) pairs.push([alt, altTgt]);

					// Auto-detect WP table prefix; fallback 'wp_'
					const prefixRes = await executor.execute(
						`mysql --defaults-extra-file=${srMycnf} ${shellQuote(dbName)} -sN -e ${shellQuote(
							`SELECT REPLACE(table_name,'options','') FROM information_schema.tables WHERE table_schema='${escapeMysql(dbName)}' AND table_name LIKE '%options' LIMIT 1`,
						)}`,
					);
					const p =
						prefixRes.code === 0 && prefixRes.stdout.trim()
							? prefixRes.stdout.trim()
							: 'wp_';

					const statements: string[] = [];
					for (const [oldRaw, newRaw] of pairs) {
						const o = escapeMysql(oldRaw);
						const n = escapeMysql(newRaw);
						statements.push(
							`UPDATE \`${p}options\` SET option_value = REPLACE(option_value, '${o}', '${n}')`,
							`UPDATE \`${p}posts\` SET post_content = REPLACE(post_content, '${o}', '${n}')`,
							`UPDATE \`${p}posts\` SET post_excerpt = REPLACE(post_excerpt, '${o}', '${n}')`,
							`UPDATE \`${p}postmeta\` SET meta_value = REPLACE(CAST(meta_value AS CHAR), '${o}', '${n}')`,
							`UPDATE \`${p}usermeta\` SET meta_value = REPLACE(meta_value, '${o}', '${n}')`,
							`UPDATE \`${p}comments\` SET comment_content = REPLACE(comment_content, '${o}', '${n}')`,
							`UPDATE \`${p}comments\` SET comment_author_url = REPLACE(comment_author_url, '${o}', '${n}')`,
						);
					}
					await executor.pushFile({
						remotePath: srSqlFile,
						content: Buffer.from(statements.join(';\n') + ';'),
					});
					const srResult = await executor.execute(
						`mysql --defaults-extra-file=${srMycnf} ${shellQuote(dbName)} < ${srSqlFile}`,
					);
					await executor
						.execute(`rm -f ${srMycnf} ${srSqlFile}`)
						.catch(() => {});
					if (srResult.code !== 0) {
						this.logger.warn(
							`URL search-replace SQL failed: ${srResult.stderr}`,
						);
					}
				}
				await job.updateProgress({
					value: 80,
					step: 'URL search-replace done',
				});

				// Write .env with new DB + URL
				const dbName2 = cyberpanel?.dbName ?? srcCreds.dbName;
				const dbUser2 = cyberpanel?.dbUser ?? srcCreds.dbUser;
				const dbPassword2 = cyberpanel?.dbPassword ?? srcCreds.dbPassword;
				await this.writeEnvFile(
					executor,
					env.root_path ?? '',
					dbName2,
					dbUser2,
					dbPassword2,
					'localhost',
					env.type ?? 'production',
					env.url ?? '',
				);

				// Store WpDbCredentials in Prisma
				await this.storeDbCredentials(
					environmentId,
					dbName2,
					dbUser2,
					dbPassword2,
					'localhost',
				);
			} else {
				// ── 2b. Fresh Bedrock install ────────────────────────────────

				const dbName = cyberpanel?.dbName ?? 'wordpress';
				const dbUser = cyberpanel?.dbUser ?? 'wordpress';
				const dbPassword = cyberpanel?.dbPassword ?? '';
				const dbHost = cyberpanel?.dbHost ?? 'localhost';

				// Install Composer if missing
				const composerCheck = await executor.execute(
					'command -v composer && echo ok || echo missing',
				);
				if (composerCheck.stdout.trim().includes('missing')) {
					await executor.execute(
						"php -r \"copy('https://getcomposer.org/installer', '/tmp/composer-setup.php');\" && php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer && rm /tmp/composer-setup.php",
					);
				}
				await job.updateProgress({ value: 40, step: 'Composer ready' });

				// Create Bedrock project
				const rootPath =
					env.root_path ?? `/home/${domain ?? 'site'}/public_html`;
				await executor.execute(
					`rm -rf ${shellQuote(rootPath)} && composer create-project roots/bedrock ${shellQuote(rootPath)} --no-interaction`,
				);
				await job.updateProgress({ value: 70, step: 'Bedrock installed' });

				await this.writeEnvFile(
					executor,
					rootPath,
					dbName,
					dbUser,
					dbPassword,
					dbHost,
					env.type ?? 'production',
					env.url ?? '',
				);
				await this.storeDbCredentials(
					environmentId,
					dbName,
					dbUser,
					dbPassword,
					dbHost,
				);
			}

			await job.updateProgress({ value: 95, step: 'Finalizing' });

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date() },
			});

			await job.updateProgress({ value: 100, step: 'Done' });
			this.logger.log(
				`Bedrock setup complete for environment #${environmentId}`,
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`CreateBedrock job failed: ${msg}`);

			// Rollback CyberPanel website if we created it
			if (websiteCreated && cpCreds && domain) {
				try {
					await callCpApi(cpCreds, '/api/deleteWebsite', {
						domainName: domain,
					});
					this.logger.warn(`Rolled back CyberPanel website: ${domain}`);
				} catch (rollbackErr) {
					this.logger.error(`CyberPanel rollback failed: ${rollbackErr}`);
				}
			}

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'failed', last_error: msg, completed_at: new Date() },
			});
			throw err;
		} finally {
			await Promise.allSettled(tempCleanup.map(fn => fn()));
		}
	}

	private async writeEnvFile(
		executor: ReturnType<typeof createRemoteExecutor>,
		rootPath: string,
		dbName: string,
		dbUser: string,
		dbPassword: string,
		dbHost: string,
		wpEnv: string,
		wpHome: string,
	) {
		// 64-character cryptographically secure random salt per WordPress specification
		const salt = () => randomBytes(48).toString('base64url').slice(0, 64);

		const envContent = [
			`DB_NAME='${dbName}'`,
			`DB_USER='${dbUser}'`,
			`DB_PASSWORD='${dbPassword}'`,
			`DB_HOST='${dbHost}'`,
			``,
			`WP_ENV=${wpEnv}`,
			`WP_HOME=${wpHome}`,
			`WP_SITEURL=\${WP_HOME}/wp`,
			``,
			`AUTH_KEY='${salt()}'`,
			`SECURE_AUTH_KEY='${salt()}'`,
			`LOGGED_IN_KEY='${salt()}'`,
			`NONCE_KEY='${salt()}'`,
			`AUTH_SALT='${salt()}'`,
			`SECURE_AUTH_SALT='${salt()}'`,
			`LOGGED_IN_SALT='${salt()}'`,
			`NONCE_SALT='${salt()}'`,
		].join('\n');

		await executor.pushFile({
			remotePath: `${rootPath}/.env`,
			content: Buffer.from(envContent),
		});
	}

	private async storeDbCredentials(
		environmentId: number,
		dbName: string,
		dbUser: string,
		dbPassword: string,
		dbHost: string,
	) {
		const data = {
			environment_id: BigInt(environmentId),
			db_name_encrypted: this.encryption.encrypt(dbName),
			db_user_encrypted: this.encryption.encrypt(dbUser),
			db_password_encrypted: this.encryption.encrypt(dbPassword),
			db_host_encrypted: this.encryption.encrypt(dbHost),
		};

		await this.prisma.wpDbCredentials.upsert({
			where: { environment_id: BigInt(environmentId) },
			create: data,
			update: {
				db_name_encrypted: data.db_name_encrypted,
				db_user_encrypted: data.db_user_encrypted,
				db_password_encrypted: data.db_password_encrypted,
				db_host_encrypted: data.db_host_encrypted,
			},
		});
	}
}
