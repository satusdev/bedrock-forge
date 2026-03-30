import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '@bedrock-forge/shared';
import { execFileSync } from 'child_process';

@Processor(QUEUES.DOMAINS)
export class DomainWhoisProcessor extends WorkerHost {
	private readonly logger = new Logger(DomainWhoisProcessor.name);

	constructor(private readonly prisma: PrismaService) {
		super();
	}

	async process(job: Job) {
		const { domainId, domain } = job.data;

		try {
			const whoisData = this.runWhois(domain);
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
		} catch (err: unknown) {
			this.logger.warn(
				`WHOIS failed for ${domain}: ${err instanceof Error ? err.message : err}`,
			);
		}
	}

	private runWhois(domain: string): string {
		try {
			return execFileSync('whois', [domain], { timeout: 30_000 }).toString();
		} catch {
			return '';
		}
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
