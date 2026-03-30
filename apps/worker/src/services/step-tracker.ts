import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ExecuteResult } from '@bedrock-forge/remote-executor';

/** Shape of a single step entry stored in JobExecution.execution_log */
export interface ExecutionLogEntry {
	ts: string; // ISO 8601 timestamp
	step: string; // Human-readable label
	level: 'info' | 'warn' | 'error';
	detail?: string; // Extra context (e.g. file paths, size)
	command?: string; // SSH command with secrets masked
	stdout?: string; // Truncated stdout (≤ 500 chars)
	stderr?: string; // Truncated stderr (≤ 500 chars)
	exitCode?: number; // Process exit code
	durationMs?: number; // Wall-clock elapsed time in ms
}

const MAX_OUTPUT_LENGTH = 500;
const SECRET_PATTERNS = [
	// MYSQL_PWD='...' or MYSQL_PWD="..."
	/MYSQL_PWD='[^']*'/g,
	/MYSQL_PWD="[^"]*"/g,
];

function maskSecrets(command: string): string {
	let masked = command;
	for (const pattern of SECRET_PATTERNS) {
		masked = masked.replace(pattern, "MYSQL_PWD='***'");
	}
	return masked;
}

function truncate(s: string): string {
	if (s.length <= MAX_OUTPUT_LENGTH) return s;
	return (
		s.slice(0, MAX_OUTPUT_LENGTH) + `… [+${s.length - MAX_OUTPUT_LENGTH} chars]`
	);
}

/**
 * StepTracker
 *
 * Accumulates structured execution log entries in memory and persists them
 * to JobExecution.execution_log after each step. Designed to be instantiated
 * once per job processor invocation.
 *
 * Every track() call also logs via the provided Logger so the console output
 * remains in sync with the persisted log.
 */
export class StepTracker {
	private entries: ExecutionLogEntry[] = [];

	constructor(
		private readonly prisma: PrismaService,
		private readonly jobExecutionId: bigint,
		private readonly logger: Logger,
		private readonly jobId: string | number,
	) {}

	/** Log a generic step (info, warn, or error). */
	async track(entry: Omit<ExecutionLogEntry, 'ts'>): Promise<void> {
		const full: ExecutionLogEntry = { ts: new Date().toISOString(), ...entry };
		this.entries.push(full);

		const logLine = `[${this.jobId}] [${full.level.toUpperCase()}] ${full.step}${full.detail ? ` — ${full.detail}` : ''}`;
		if (full.level === 'error') this.logger.error(logLine);
		else if (full.level === 'warn') this.logger.warn(logLine);
		else this.logger.log(logLine);

		await this.flush();
	}

	/**
	 * Log a remote SSH command result with timing information.
	 * Automatically masks secrets in the command string.
	 */
	async trackCommand(
		step: string,
		command: string,
		result: ExecuteResult,
		durationMs: number,
	): Promise<void> {
		const level = result.code !== 0 ? 'error' : 'info';
		await this.track({
			step,
			level,
			command: maskSecrets(command),
			stdout: result.stdout ? truncate(result.stdout) : undefined,
			stderr: result.stderr ? truncate(result.stderr) : undefined,
			exitCode: result.code,
			durationMs,
		});
	}

	/** Persist the current entries array to the database. Fire-and-forget safe. */
	async flush(): Promise<void> {
		await this.prisma.jobExecution
			.update({
				where: { id: this.jobExecutionId },
				data: { execution_log: this.entries as object[] },
			})
			.catch(err =>
				this.logger.error(
					`[${this.jobId}] StepTracker flush failed: ${err instanceof Error ? err.message : String(err)}`,
				),
			);
	}

	/** Return a snapshot of all entries (for inspection / test assertions). */
	getEntries(): ExecutionLogEntry[] {
		return [...this.entries];
	}
}
