import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '@bedrock-forge/shared';
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
