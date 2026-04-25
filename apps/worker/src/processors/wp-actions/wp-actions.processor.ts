import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { StepTracker } from '../../services/step-tracker';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface WpFixActionPayload {
environmentId: number;
jobExecutionId: number;
action: 'flush_rewrite' | 'clear_cache' | 'fix_permissions' | 'disable_plugins' | 'enable_plugins';
}

export interface WpDebugTogglePayload {
environmentId: number;
jobExecutionId: number;
enabled: boolean;
revertAfterMinutes?: number;
}

export interface WpCleanupPayload {
environmentId: number;
jobExecutionId: number;
dryRun?: boolean;
}

export interface WpLogsPayload {
environmentId: number;
jobExecutionId: number;
type: 'debug' | 'php' | 'nginx' | 'apache';
lines?: number;
}

export interface WpCronPayload {
environmentId: number;
jobExecutionId: number;
}

@Processor(QUEUES.WP_ACTIONS, { concurrency: 2 })
export class WpActionsProcessor extends WorkerHost {
private readonly logger = new Logger(WpActionsProcessor.name);

constructor(
private readonly prisma: PrismaService,
private readonly config: ConfigService,
private readonly sshKey: SshKeyService,
) {
super();
}

async process(job: Job): Promise<unknown> {
switch (job.name) {
case JOB_TYPES.WP_FIX_ACTION:
return this.processFixAction(job);
case JOB_TYPES.WP_DEBUG_TOGGLE:
return this.processDebugToggle(job);
case JOB_TYPES.WP_DEBUG_REVERT:
return this.processDebugRevert(job);
case JOB_TYPES.WP_LOGS_FETCH:
return this.processLogsFetch(job);
case JOB_TYPES.WP_CRON_LIST:
return this.processCronList(job);
case JOB_TYPES.WP_CLEANUP:
return this.processCleanup(job);
default:
throw new Error(`Unknown wp-actions job type: ${job.name}`);
}
}

private async processFixAction(job: Job): Promise<unknown> {
const { environmentId, jobExecutionId, action } = job.data as WpFixActionPayload;
const tracker = new StepTracker(this.prisma, BigInt(jobExecutionId), this.logger, job.id ?? '');
try {
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'active', started_at: new Date() },
});
await tracker.track({ step: `WP action: ${action}`, level: 'info', detail: `env=${environmentId}` });
const { executor, env } = await this.connectToEnv(environmentId, tracker);
await job.updateProgress(20);
const scriptsPath = this.config.get<string>('scriptsPath')!;
const remoteScript = `/tmp/wp_actions_${job.id}.php`;
await executor.pushFile({ remotePath: remoteScript, content: readFileSync(join(scriptsPath, 'wp-actions.php')) });
await job.updateProgress(40);
const cmd = `php ${remoteScript} --docroot=${shellQuote(env.root_path ?? '')} --action=${shellQuote(action)}`;
const t0 = Date.now();
const result = await executor.execute(cmd, { timeout: 60_000 });
await executor.execute(`rm -f ${remoteScript}`, { timeout: 5_000 }).catch(() => {});
const parsed = safeJsonParse(result.stdout);
await tracker.trackCommand('wp-actions.php', cmd, result, Date.now() - t0);
await job.updateProgress(100);
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'completed', completed_at: new Date(), progress: 100, execution_log: parsed ?? {} },
});
return parsed;
} catch (err: unknown) {
await this.failJob(jobExecutionId, job.id ?? '', tracker, `wp:fix-action(${action})`, err);
throw err;
}
}

private async processDebugToggle(job: Job): Promise<unknown> {
const { environmentId, jobExecutionId, enabled, revertAfterMinutes } = job.data as WpDebugTogglePayload;
const tracker = new StepTracker(this.prisma, BigInt(jobExecutionId), this.logger, job.id ?? '');
try {
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'active', started_at: new Date() },
});
await tracker.track({ step: `WP Debug: ${enabled ? 'enable' : 'disable'}`, level: 'info' });
const { executor, env } = await this.connectToEnv(environmentId, tracker);
await job.updateProgress(20);
const scriptsPath = this.config.get<string>('scriptsPath')!;
const remoteScript = `/tmp/wp_debug_${job.id}.php`;
await executor.pushFile({ remotePath: remoteScript, content: readFileSync(join(scriptsPath, 'wp-debug.php')) });
const actionArg = enabled ? 'enable' : 'disable';
const cmd = `php ${remoteScript} --docroot=${shellQuote(env.root_path ?? '')} --action=${actionArg}`;
const result = await executor.execute(cmd, { timeout: 30_000 });
await executor.execute(`rm -f ${remoteScript}`, { timeout: 5_000 }).catch(() => {});
const parsed = safeJsonParse(result.stdout);
await tracker.trackCommand('wp-debug.php', cmd, result, 0);
if (enabled && revertAfterMinutes && revertAfterMinutes > 0) {
const { Queue } = await import('bullmq');
const redisUrl = this.config.get<string>('redis.url')!;
const wpActionsQueue = new Queue(QUEUES.WP_ACTIONS, { connection: { url: redisUrl } });
const revertExec = await this.prisma.jobExecution.create({
data: {
queue_name: QUEUES.WP_ACTIONS,
job_type: JOB_TYPES.WP_DEBUG_REVERT,
bull_job_id: randomUUID(),
environment_id: BigInt(environmentId),
status: 'queued',
payload: { environmentId, scheduledAt: new Date().toISOString() } as object,
},
});
await wpActionsQueue.add(
JOB_TYPES.WP_DEBUG_REVERT,
{ environmentId, jobExecutionId: Number(revertExec.id), enabled: false },
{ ...DEFAULT_JOB_OPTIONS, delay: revertAfterMinutes * 60 * 1000 },
);
await wpActionsQueue.close();
await tracker.track({ step: `Auto-revert scheduled in ${revertAfterMinutes}m`, level: 'info' });
}
await job.updateProgress(100);
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'completed', completed_at: new Date(), progress: 100, execution_log: parsed ?? {} },
});
return parsed;
} catch (err: unknown) {
await this.failJob(jobExecutionId, job.id ?? '', tracker, 'wp:debug-toggle', err);
throw err;
}
}

private async processDebugRevert(job: Job): Promise<unknown> {
return this.processDebugToggle(job);
}

private async processLogsFetch(job: Job): Promise<unknown> {
const { environmentId, jobExecutionId, type, lines } = job.data as WpLogsPayload;
const tracker = new StepTracker(this.prisma, BigInt(jobExecutionId), this.logger, job.id ?? '');
try {
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'active', started_at: new Date() },
});
await tracker.track({ step: `WP Logs: ${type}`, level: 'info' });
const { executor, env } = await this.connectToEnv(environmentId, tracker);
await job.updateProgress(20);
const scriptsPath = this.config.get<string>('scriptsPath')!;
const remoteScript = `/tmp/wp_logs_${job.id}.php`;
await executor.pushFile({ remotePath: remoteScript, content: readFileSync(join(scriptsPath, 'wp-logs.php')) });
const linesArg = lines ?? 100;
const cmd = `php ${remoteScript} --docroot=${shellQuote(env.root_path ?? '')} --type=${shellQuote(type)} --lines=${linesArg}`;
const result = await executor.execute(cmd, { timeout: 30_000 });
await executor.execute(`rm -f ${remoteScript}`, { timeout: 5_000 }).catch(() => {});
const parsed = safeJsonParse(result.stdout);
await job.updateProgress(100);
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'completed', completed_at: new Date(), progress: 100, execution_log: parsed ?? {} },
});
return parsed;
} catch (err: unknown) {
await this.failJob(jobExecutionId, job.id ?? '', tracker, 'wp:logs-fetch', err);
throw err;
}
}

private async processCronList(job: Job): Promise<unknown> {
const { environmentId, jobExecutionId } = job.data as WpCronPayload;
const tracker = new StepTracker(this.prisma, BigInt(jobExecutionId), this.logger, job.id ?? '');
try {
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'active', started_at: new Date() },
});
await tracker.track({ step: 'WP Cron: list', level: 'info' });
const { executor, env } = await this.connectToEnv(environmentId, tracker);
await job.updateProgress(20);
const scriptsPath = this.config.get<string>('scriptsPath')!;
const remoteScript = `/tmp/wp_cron_${job.id}.php`;
await executor.pushFile({ remotePath: remoteScript, content: readFileSync(join(scriptsPath, 'wp-cron.php')) });
const cmd = `php ${remoteScript} --docroot=${shellQuote(env.root_path ?? '')}`;
const result = await executor.execute(cmd, { timeout: 30_000 });
await executor.execute(`rm -f ${remoteScript}`, { timeout: 5_000 }).catch(() => {});
const parsed = safeJsonParse(result.stdout);
await job.updateProgress(100);
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'completed', completed_at: new Date(), progress: 100, execution_log: parsed ?? {} },
});
return parsed;
} catch (err: unknown) {
await this.failJob(jobExecutionId, job.id ?? '', tracker, 'wp:cron-list', err);
throw err;
}
}

private async processCleanup(job: Job): Promise<unknown> {
const { environmentId, jobExecutionId, dryRun } = job.data as WpCleanupPayload;
const tracker = new StepTracker(this.prisma, BigInt(jobExecutionId), this.logger, job.id ?? '');
try {
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'active', started_at: new Date() },
});
await tracker.track({ step: `WP Cleanup (dry=${dryRun ?? false})`, level: 'info' });
const { executor, env } = await this.connectToEnv(environmentId, tracker);
await job.updateProgress(20);
const scriptsPath = this.config.get<string>('scriptsPath')!;
const remoteScript = `/tmp/wp_cleanup_${job.id}.php`;
await executor.pushFile({ remotePath: remoteScript, content: readFileSync(join(scriptsPath, 'wp-cleanup.php')) });
const dryRunArg = dryRun ? ' --dry-run' : '';
const cmd = `php ${remoteScript} --docroot=${shellQuote(env.root_path ?? '')}${dryRunArg}`;
const t0 = Date.now();
const result = await executor.execute(cmd, { timeout: 120_000 });
await executor.execute(`rm -f ${remoteScript}`, { timeout: 5_000 }).catch(() => {});
const parsed = safeJsonParse(result.stdout);
await tracker.trackCommand('wp-cleanup.php', cmd, result, Date.now() - t0);
await job.updateProgress(100);
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'completed', completed_at: new Date(), progress: 100, execution_log: parsed ?? {} },
});
return parsed;
} catch (err: unknown) {
await this.failJob(jobExecutionId, job.id ?? '', tracker, 'wp:cleanup', err);
throw err;
}
}

private async connectToEnv(environmentId: number, tracker: StepTracker) {
const env = await this.prisma.environment.findUniqueOrThrow({
where: { id: BigInt(environmentId) },
include: { server: true },
});
await tracker.track({ step: 'Connecting to server', level: 'info', detail: env.server.ip_address });
const privateKey = await this.sshKey.resolvePrivateKey(env.server);
const executor = createRemoteExecutor({
host: env.server.ip_address,
port: env.server.ssh_port,
username: env.server.ssh_user,
privateKey,
});
return { executor, env };
}

private async failJob(jobExecutionId: number, jobId: string, tracker: StepTracker, step: string, err: unknown): Promise<void> {
const msg = err instanceof Error ? err.message : String(err);
this.logger.error(`WP actions job ${jobId} failed (${step}): ${msg}`);
await tracker.track({ step: `${step} failed`, level: 'error', detail: msg }).catch(() => {});
await this.prisma.jobExecution
.update({ where: { id: BigInt(jobExecutionId) }, data: { status: 'failed', last_error: msg, completed_at: new Date() } })
.catch(() => {});
}
}

function shellQuote(value: string): string {
return "'" + value.replace(/'/g, "'\\''") + "'";
}

function safeJsonParse(str: string): unknown {
try {
return JSON.parse(str.trim());
} catch {
return null;
}
}
