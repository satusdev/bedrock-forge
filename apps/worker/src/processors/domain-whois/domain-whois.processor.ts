import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as tls from 'tls';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// concurrency=2: whois lookups spawn child processes — cap to avoid fork storms.
@Processor(QUEUES.DOMAINS, { concurrency: 2 })
export class DomainWhoisProcessor extends WorkerHost {
	private readonly logger = new Logger(DomainWhoisProcessor.name);

	constructor(private readonly prisma: PrismaService) {
		super();
	}

	async process(job: Job) {
		if (job.name === JOB_TYPES.DOMAIN_SSL_CHECK) {
			return this.processSsl(job);
		}
		return this.processWhois(job);
	}

	private async processWhois(job: Job) {
		const { domainId, domain } = job.data;

		const whoisData = await this.runWhois(domain);
		const expiresAt = this.parseExpiry(whoisData);
		const registrar = this.parseRegistrar(whoisData);

		await this.prisma.domain.update({
			where: { id: BigInt(domainId) },
			data: {
				whois_json: {
					raw: whoisData,
					parsed: { registrar, expires_at: expiresAt?.toISOString() },
				} as never,
				expires_at: expiresAt,
				last_checked_at: new Date(),
			},
		});
		this.logger.log(`WHOIS updated for ${domain}`);
	}

	private async processSsl(job: Job) {
		const { domainId, domain } = job.data;

		const cert = await this.fetchSslCert(domain);
		if (!cert) {
			this.logger.warn(`SSL cert not retrievable for ${domain}`);
			return;
		}

		const sslExpiresAt = cert.valid_to ? new Date(cert.valid_to) : null;
		const sslIssuer =
			(cert.issuer as Record<string, string> | undefined)?.O ?? null;

		await this.prisma.domain.update({
			where: { id: BigInt(domainId) },
			data: {
				ssl_json: cert as never,
				ssl_expires_at: sslExpiresAt,
				ssl_issuer: sslIssuer,
				ssl_checked_at: new Date(),
			},
		});
		this.logger.log(
			`SSL updated for ${domain} (expires: ${sslExpiresAt?.toISOString()})`,
		);
	}

	private fetchSslCert(domain: string): Promise<tls.PeerCertificate | null> {
		return new Promise(resolve => {
			const socket = tls.connect(
				{
					host: domain,
					port: 443,
					servername: domain,
					rejectUnauthorized: false,
				},
				() => {
					const cert = socket.getPeerCertificate();
					socket.destroy();
					resolve(cert && Object.keys(cert).length ? cert : null);
				},
			);
			socket.on('error', () => {
				socket.destroy();
				resolve(null);
			});
			socket.setTimeout(15_000, () => {
				socket.destroy();
				resolve(null);
			});
		});
	}

	private async runWhois(domain: string): Promise<string> {
		const { stdout } = await execFileAsync('whois', [domain], {
			timeout: 30_000,
		});
		return stdout;
	}

	private parseExpiry(raw: string): Date | null {
		const match = raw.match(/expir(?:y|ation)[^:]*:\s*(.+)/i);
		if (!match) return null;
		const d = new Date(match[1].trim());
		return isNaN(d.getTime()) ? null : d;
	}

	private parseRegistrar(raw: string): string | null {
		const match = raw.match(/registrar:\s*(.+)/i);
		return match ? match[1].trim() : null;
	}
}
