import { Client } from 'ssh2';
import {
	sshPoolManager,
	SshServerConfig,
	SshPoolManager,
} from './ssh-pool.manager.js';

export interface ExecuteOptions {
	timeout?: number; // ms, default 30000
	cwd?: string;
}

export interface ExecuteResult {
	stdout: string;
	stderr: string;
	code: number;
}

export interface RemoteFile {
	content: string | Buffer;
	remotePath: string;
	mode?: number; // octal, default 0o644
}

/**
 * RemoteExecutorService
 *
 * Single access point for all SSH-based remote operations. Uses the global
 * SshPoolManager. Never called directly from controllers — always invoked
 * inside BullMQ job processors.
 *
 * Usage:
 *   const executor = new RemoteExecutorService(serverConfig);
 *   const result = await executor.execute('cat /var/www/html/wp-config.php');
 */
export class RemoteExecutorService {
	constructor(
		private readonly config: SshServerConfig,
		private readonly pool: SshPoolManager = sshPoolManager,
	) {}

	/**
	 * Execute a shell command on the remote server.
	 * Returns stdout, stderr, and exit code.
	 */
	async execute(
		command: string,
		opts: ExecuteOptions = {},
	): Promise<ExecuteResult> {
		const timeout = opts.timeout ?? 30_000;
		const client = await this.pool.getConnection(
			this.config.host as unknown as number,
			this.config,
		);

		try {
			return await this.runCommand(client, command, timeout);
		} finally {
			this.pool.releaseConnection(
				this.config.host as unknown as number,
				client,
			);
		}
	}

	/**
	 * Push a file to the remote server via SFTP.
	 */
	async pushFile(file: RemoteFile): Promise<void> {
		const client = await this.pool.getConnection(
			this.config.host as unknown as number,
			this.config,
		);
		try {
			await this.sftpPut(client, file);
		} finally {
			this.pool.releaseConnection(
				this.config.host as unknown as number,
				client,
			);
		}
	}

	/**
	 * Pull a file's content from the remote server via SFTP.
	 */
	async pullFile(remotePath: string): Promise<Buffer> {
		const client = await this.pool.getConnection(
			this.config.host as unknown as number,
			this.config,
		);
		try {
			return await this.sftpGet(client, remotePath);
		} finally {
			this.pool.releaseConnection(
				this.config.host as unknown as number,
				client,
			);
		}
	}

	private runCommand(
		client: Client,
		command: string,
		timeout: number,
	): Promise<ExecuteResult> {
		return new Promise((resolve, reject) => {
			let stdout = '';
			let stderr = '';

			const timer = setTimeout(() => {
				reject(
					new Error(
						`Command timed out after ${timeout}ms: ${command.slice(0, 100)}`,
					),
				);
			}, timeout);

			client.exec(command, (err, stream) => {
				if (err) {
					clearTimeout(timer);
					return reject(err);
				}

				stream.on('data', (data: Buffer) => {
					stdout += data.toString();
				});

				stream.stderr.on('data', (data: Buffer) => {
					stderr += data.toString();
				});

				stream.on('close', (code: number) => {
					clearTimeout(timer);
					resolve({
						stdout: stdout.trim(),
						stderr: stderr.trim(),
						code: code ?? 0,
					});
				});

				stream.on('error', (err: Error) => {
					clearTimeout(timer);
					reject(err);
				});
			});
		});
	}

	private sftpPut(client: Client, file: RemoteFile): Promise<void> {
		return new Promise((resolve, reject) => {
			client.sftp((err, sftp) => {
				if (err) return reject(err);

				const content =
					typeof file.content === 'string'
						? Buffer.from(file.content, 'utf-8')
						: file.content;

				const writeStream = sftp.createWriteStream(file.remotePath, {
					mode: file.mode ?? 0o644,
				});

				writeStream.on('close', resolve);
				writeStream.on('error', reject);
				writeStream.end(content);
			});
		});
	}

	private sftpGet(client: Client, remotePath: string): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			client.sftp((err, sftp) => {
				if (err) return reject(err);

				const chunks: Buffer[] = [];
				const readStream = sftp.createReadStream(remotePath);

				readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
				readStream.on('end', () => resolve(Buffer.concat(chunks)));
				readStream.on('error', reject);
			});
		});
	}
}

/**
 * Factory function — creates a RemoteExecutorService for a given server config.
 * Used in processors where the server config is pulled from PrismaService.
 */
export function createRemoteExecutor(
	config: SshServerConfig,
): RemoteExecutorService {
	return new RemoteExecutorService(config);
}
