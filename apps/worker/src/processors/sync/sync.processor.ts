import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { RcloneService } from '../../services/rclone.service';
import { StepTracker } from '../../services/step-tracker';
import {
createRemoteExecutor,
CredentialParserService,
} from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';

const STAGING_DIR = '/tmp/forge-sync';

/**
 * Wrap a string in single quotes for safe shell embedding.
 * Single quotes inside the value are escaped as: ' -> '\''
 */
function shellQuote(value: string): string {
return "'" + value.replace(/'/g, "'\\''") + "'";
}

/** Escape a string value for safe interpolation into a MySQL string literal. */
function escapeMysql(str: string): string {
return str
.replace(/\\/g, '\\\\')
.replace(/'/g, "\\'")
.replace(/\0/g, '\\0')
.replace(/\n/g, '\\n')
.replace(/\r/g, '\\r');
}

type Creds = { dbHost: string; dbUser: string; dbPassword: string; dbName: string };
type Executor = Awaited<ReturnType<typeof createRemoteExecutor>>;

@Processor(QUEUES.SYNC)
export class SyncProcessor extends WorkerHost {
private readonly logger = new Logger(SyncProcessor.name);
private readonly credParser = new CredentialParserService();

constructor(
private readonly prisma: PrismaService,
private readonly sshKey: SshKeyService,
private readonly rclone: RcloneService,
) {
super();
}

async process(job: Job) {
const { jobExecutionId } = job.data;
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'active', started_at: new Date() },
});

try {
if (job.name === JOB_TYPES.SYNC_CLONE) {
await this.processClone(job);
} else {
await this.processPush(job);
}

await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: { status: 'completed', completed_at: new Date() },
});
} catch (err: unknown) {
const msg = err instanceof Error ? err.message : String(err);
await this.prisma.jobExecution.update({
where: { id: BigInt(jobExecutionId) },
data: {
status: 'failed',
last_error: msg,
completed_at: new Date(),
},
});
throw err;
}
}

// ── Clone ──────────────────────────────────────────────────────────────────

private async processClone(job: Job) {
const { sourceEnvironmentId, targetEnvironmentId, jobExecutionId } = job.data;

const tracker = new StepTracker(
this.prisma,
BigInt(jobExecutionId),
this.logger,
job.id ?? '',
);

await tracker.track({
step: 'Database sync started',
level: 'info',
detail: `source env ${sourceEnvironmentId} → target env ${targetEnvironmentId}`,
});

// Load environments
const [sourceEnv, targetEnv] = await Promise.all([
this.prisma.environment.findUniqueOrThrow({
where: { id: BigInt(sourceEnvironmentId) },
include: { server: true, project: true },
}),
this.prisma.environment.findUniqueOrThrow({
where: { id: BigInt(targetEnvironmentId) },
include: { server: true, project: true },
}),
]);

// Connect to both servers
await tracker.track({ step: 'Connecting to source server', level: 'info', detail: sourceEnv.server.ip_address });
const sourceExecutor = createRemoteExecutor({
host: sourceEnv.server.ip_address,
port: sourceEnv.server.ssh_port,
username: sourceEnv.server.ssh_user,
privateKey: await this.sshKey.resolvePrivateKey(sourceEnv.server),
});

await tracker.track({ step: 'Connecting to target server', level: 'info', detail: targetEnv.server.ip_address });
const targetExecutor = createRemoteExecutor({
host: targetEnv.server.ip_address,
port: targetEnv.server.ssh_port,
username: targetEnv.server.ssh_user,
privateKey: await this.sshKey.resolvePrivateKey(targetEnv.server),
});

await job.updateProgress({ value: 5, step: 'Connected to servers' });

// Resolve credentials
await tracker.track({ step: 'Reading source database credentials', level: 'info', detail: sourceEnv.root_path });
const sourceCreds = await this.resolveCredentials(sourceExecutor, sourceEnv.root_path, tracker, 'source');

await tracker.track({ step: 'Reading target database credentials', level: 'info', detail: targetEnv.root_path });
const targetCreds = await this.resolveCredentials(targetExecutor, targetEnv.root_path, tracker, 'target');

await job.updateProgress({ value: 15, step: 'Credentials resolved' });

// Auto-detect URLs for search-replace — no manual input required
const sourceUrl = await this.resolveWpUrl(sourceExecutor, sourceCreds, tracker, 'source', sourceEnv.url);
const targetUrl = await this.resolveWpUrl(targetExecutor, targetCreds, tracker, 'target', targetEnv.url);

await job.updateProgress({ value: 20, step: 'URLs resolved' });

// Safety backup of target (mandatory — blocks sync if it fails)
await this.createSafetyBackup(job, targetEnv, targetExecutor, targetCreds, tracker);
await job.updateProgress({ value: 40, step: 'Safety backup complete' });

// Dump source DB
const dumpRemote = `/tmp/sync_${job.id}.sql`;
const dumpCmd = `MYSQL_PWD=${shellQuote(sourceCreds.dbPassword)} mysqldump -h${sourceCreds.dbHost} -u${sourceCreds.dbUser} ${sourceCreds.dbName}`;
const maskedDump = `MYSQL_PWD='***' mysqldump -h${sourceCreds.dbHost} -u${sourceCreds.dbUser} ${sourceCreds.dbName}`;

await tracker.track({ step: 'Dumping source database', level: 'info', command: maskedDump });
const dumpStart = Date.now();
const dumpResult = await sourceExecutor.execute(`${dumpCmd} > ${dumpRemote}`);
await tracker.trackCommand('mysqldump source database', maskedDump, dumpResult, Date.now() - dumpStart);

if (dumpResult.code !== 0) {
throw new Error(`mysqldump failed (exit ${dumpResult.code}): ${dumpResult.stderr}`);
}

await job.updateProgress({ value: 55, step: 'Source database dumped' });

// Transfer dump to target
await tracker.track({ step: 'Transferring database dump to target', level: 'info' });
const dumpBuffer = await sourceExecutor.pullFile(dumpRemote);
const cleanSrcResult = await sourceExecutor.execute(`rm -f ${dumpRemote}`);
await tracker.trackCommand('Source temp cleanup', `rm -f ${dumpRemote}`, cleanSrcResult, 0);

await targetExecutor.pushFile({ remotePath: dumpRemote, content: dumpBuffer });
await job.updateProgress({ value: 65, step: 'Dump transferred to target' });

// Import on target
const importCmd = `MYSQL_PWD=${shellQuote(targetCreds.dbPassword)} mysql -h${targetCreds.dbHost} -u${targetCreds.dbUser} ${targetCreds.dbName}`;
const maskedImport = `MYSQL_PWD='***' mysql -h${targetCreds.dbHost} -u${targetCreds.dbUser} ${targetCreds.dbName}`;

await tracker.track({ step: 'Importing database on target', level: 'info', command: maskedImport });
const importStart = Date.now();
const importResult = await targetExecutor.execute(`${importCmd} < ${dumpRemote}`);
await tracker.trackCommand('mysql import on target', maskedImport, importResult, Date.now() - importStart);

const cleanTgtResult = await targetExecutor.execute(`rm -f ${dumpRemote}`);
await tracker.trackCommand('Target temp cleanup', `rm -f ${dumpRemote}`, cleanTgtResult, 0);

if (importResult.code !== 0) {
throw new Error(`mysql import failed (exit ${importResult.code}): ${importResult.stderr}`);
}

await job.updateProgress({ value: 80, step: 'Database imported on target' });

// URL search-replace (auto-detected — no user input)
if (sourceUrl && targetUrl && sourceUrl !== targetUrl) {
await tracker.track({
step: 'Running URL search-replace on target',
level: 'info',
detail: `${sourceUrl} → ${targetUrl}`,
});
const srSql = `UPDATE wp_options SET option_value = REPLACE(option_value, '${escapeMysql(sourceUrl)}', '${escapeMysql(targetUrl)}') WHERE option_name IN ('siteurl','home')`;
const srCmd = `MYSQL_PWD=${shellQuote(targetCreds.dbPassword)} mysql -h${targetCreds.dbHost} -u${targetCreds.dbUser} ${targetCreds.dbName} -e ${shellQuote(srSql)}`;
const maskedSr = `MYSQL_PWD='***' mysql ... -e "UPDATE wp_options SET option_value = REPLACE(...) WHERE option_name IN ('siteurl','home')"`;

const srStart = Date.now();
const srResult = await targetExecutor.execute(srCmd);
await tracker.trackCommand('wp_options URL search-replace', maskedSr, srResult, Date.now() - srStart);

if (srResult.code !== 0) {
await tracker.track({
step: 'URL search-replace failed — sync still complete',
level: 'warn',
detail: srResult.stderr,
});
}
} else {
await tracker.track({
step: 'URL search-replace skipped',
level: 'info',
detail: !sourceUrl || !targetUrl
? 'Could not detect one or both URLs'
: `Source and target URLs are identical (${sourceUrl})`,
});
}

await job.updateProgress({ value: 100, step: 'Database sync complete' });
await tracker.track({
step: 'Sync complete',
level: 'info',
detail: sourceUrl && targetUrl && sourceUrl !== targetUrl
? `URL changed: ${sourceUrl} → ${targetUrl}`
: 'Database cloned successfully',
});
}

// ── Push (placeholder) ──────────────────────────────────────────────────────

private async processPush(job: Job) {
const { environmentId, scope, jobExecutionId } = job.data;
const tracker = new StepTracker(
this.prisma,
BigInt(jobExecutionId),
this.logger,
job.id ?? '',
);
await tracker.track({
step: 'Sync push not yet implemented',
level: 'warn',
detail: `env=${environmentId} scope=${scope}`,
});
await job.updateProgress({ value: 100, step: 'Skipped' });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve DB credentials from a remote environment.
 * Tries wp-config.php first, then .env one level up (Bedrock layout).
 */
private async resolveCredentials(
executor: Executor,
rootPath: string,
tracker: StepTracker,
label: string,
): Promise<Creds> {
// Attempt 1: wp-config.php (standard WordPress)
try {
const buf = await executor.pullFile(`${rootPath}/wp-config.php`);
const creds = this.credParser.parse(buf.toString('utf8'));
if (creds) {
await tracker.track({ step: `${label} credentials from wp-config.php`, level: 'info' });
return creds as Creds;
}
} catch {
// file may not exist for Bedrock installs
}

// Attempt 2: .env one directory above root_path (Bedrock)
const parentEnv = rootPath.replace(/\/[^/]+\/?$/, '/.env');
try {
const buf = await executor.pullFile(parentEnv);
const creds = this.credParser.parse(buf.toString('utf8'));
if (creds) {
await tracker.track({ step: `${label} credentials from .env (Bedrock)`, level: 'info', detail: parentEnv });
return creds as Creds;
}
} catch {
// not a Bedrock install
}

throw new Error(
`Could not resolve database credentials for ${label} environment at ${rootPath}. ` +
`Neither wp-config.php nor .env was readable or parseable.`,
);
}

/**
 * Detect the WordPress siteurl.
 * Priority: env.url field stored in DB > wp_options query.
 */
private async resolveWpUrl(
executor: Executor,
creds: Creds,
tracker: StepTracker,
label: string,
envUrl?: string | null,
): Promise<string | null> {
if (envUrl && envUrl.trim()) {
const url = envUrl.trim().replace(/\/$/, '');
await tracker.track({ step: `${label} URL from environment record`, level: 'info', detail: url });
return url;
}

const query = `SELECT option_value FROM wp_options WHERE option_name = 'siteurl' LIMIT 1`;
const cmd = `MYSQL_PWD=${shellQuote(creds.dbPassword)} mysql -h${creds.dbHost} -u${creds.dbUser} ${creds.dbName} -sN -e ${shellQuote(query)}`;
try {
const result = await executor.execute(cmd);
if (result.code === 0 && result.stdout.trim()) {
const url = result.stdout.trim().replace(/\/$/, '');
await tracker.track({ step: `${label} URL from wp_options`, level: 'info', detail: url });
return url;
}
} catch {
// non-fatal
}

await tracker.track({ step: `Could not detect ${label} URL`, level: 'warn', detail: 'Search-replace skipped for this side' });
return null;
}

/**
 * Create a DB-only safety backup of the target and upload to GDrive.
 * Blocks sync if GDrive upload fails — data safety is mandatory.
 */
private async createSafetyBackup(
job: Job,
targetEnv: {
id: bigint;
google_drive_folder_id: string | null;
root_path: string;
server: { ip_address: string };
},
targetExecutor: Executor,
targetCreds: Creds,
tracker: StepTracker,
): Promise<void> {
const gdriveFolder = targetEnv.google_drive_folder_id;
if (!gdriveFolder) {
throw new Error(
'Target environment has no Google Drive folder configured. Cannot create safety backup before sync.',
);
}

await tracker.track({
step: 'Creating safety backup of target before overwrite',
level: 'info',
detail: `GDrive folder: ${gdriveFolder}`,
});

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = `sync-safety-${ts}.sql`;
const remoteTemp = `/tmp/sync_safety_${job.id}.sql`;
const localDir = join(STAGING_DIR, String(job.id));
const localFile = join(localDir, filename);

// Dump target DB to temp file on target server
const dumpCmd = `MYSQL_PWD=${shellQuote(targetCreds.dbPassword)} mysqldump -h${targetCreds.dbHost} -u${targetCreds.dbUser} ${targetCreds.dbName}`;
const maskedDump = `MYSQL_PWD='***' mysqldump -h${targetCreds.dbHost} -u${targetCreds.dbUser} ${targetCreds.dbName}`;

const dumpStart = Date.now();
const dumpResult = await targetExecutor.execute(`${dumpCmd} > ${remoteTemp}`);
await tracker.trackCommand('Safety backup: mysqldump target', maskedDump, dumpResult, Date.now() - dumpStart);

if (dumpResult.code !== 0) {
throw new Error(`Safety backup mysqldump failed (exit ${dumpResult.code}): ${dumpResult.stderr}`);
}

// Pull dump and upload to GDrive
await mkdir(localDir, { recursive: true });
const dumpBuffer = await targetExecutor.pullFile(remoteTemp);
await targetExecutor.execute(`rm -f ${remoteTemp}`);

const { writeFile } = await import('fs/promises');
await writeFile(localFile, dumpBuffer);

await tracker.track({
step: 'Safety backup pulled — uploading to Google Drive',
level: 'info',
detail: `${filename} (${dumpBuffer.length} bytes)`,
});

try {
const configOk = await this.rclone.writeConfig();
if (!configOk) {
throw new Error('Google Drive rclone not configured. Configure rclone in Settings first.');
}

const uploadStart = Date.now();
const filePath = await this.rclone.upload(localFile, gdriveFolder, filename);
await tracker.track({
step: 'Safety backup uploaded to Google Drive',
level: 'info',
detail: filePath,
durationMs: Date.now() - uploadStart,
});

// Record in the database so it appears in the Backups tab
await this.prisma.backup.create({
data: {
environment_id: targetEnv.id,
type: 'db_only',
status: 'completed',
file_path: filePath,
size_bytes: BigInt(dumpBuffer.length),
completed_at: new Date(),
started_at: new Date(),
},
});

await tracker.track({ step: 'Safety backup recorded', level: 'info' });
} finally {
await rm(localDir, { recursive: true, force: true });
}
}
}
