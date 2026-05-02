import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import * as ipaddr from 'ipaddr.js';
import { SettingsRepository } from '../../modules/settings/settings.repository';

// Docker/localhost CIDRs that are always allowed regardless of user config
const ALWAYS_ALLOWED_CIDRS = [
	'127.0.0.0/8',
	'::1/128',
	'10.0.0.0/8',
	'172.16.0.0/12',
	'192.168.0.0/16',
];

@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
	private readonly logger = new Logger(IpAllowlistMiddleware.name);

	// 60-second in-memory cache so we don't hit the DB on every request
	private cache: { cidrs: string[]; expiresAt: number } | null = null;

	constructor(private readonly settingsRepo: SettingsRepository) {}

	async use(req: Request, res: Response, next: NextFunction) {
		let userCidrs: string[];
		try {
			userCidrs = await this.getUserCidrs();
		} catch (err) {
			// If we can't read settings, fail open (don't block legitimate traffic)
			this.logger.error(
				`IP allowlist check failed — fail open: ${err instanceof Error ? err.message : String(err)}`,
			);
			return next();
		}

		// Empty allowlist = feature disabled, allow all
		if (userCidrs.length === 0) return next();

		const remoteIp = this.extractIp(req);
		if (!remoteIp) {
			this.logger.warn('Could not determine remote IP, blocking request');
			return this.deny(res, 'Could not determine client IP');
		}

		if (this.isAllowed(remoteIp, [...ALWAYS_ALLOWED_CIDRS, ...userCidrs])) {
			return next();
		}

		this.logger.warn(`IP allowlist: blocked ${remoteIp}`);
		return this.deny(res, 'Access denied by IP allowlist');
	}

	private async getUserCidrs(): Promise<string[]> {
		const now = Date.now();
		if (this.cache && this.cache.expiresAt > now) return this.cache.cidrs;

		const setting = await this.settingsRepo.findByKey('security_ip_allowlist');
		const cidrs = setting ? (JSON.parse(setting.value) as string[]) : [];
		this.cache = { cidrs, expiresAt: now + 60_000 };
		return cidrs;
	}

	private extractIp(req: Request): string | null {
		const remoteAddr = req.socket.remoteAddress ?? '';
		// Only honour X-Forwarded-For when the TCP connection came from a trusted
		// proxy (Docker/nginx/localhost). Without this check, any client could send
		// X-Forwarded-For: 127.0.0.1 and bypass the allowlist entirely.
		if (this.isAllowed(remoteAddr, ALWAYS_ALLOWED_CIDRS)) {
			const forwarded = req.headers['x-forwarded-for'];
			if (forwarded) {
				const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
					.split(',')[0]
					.trim();
				if (ip) return ip;
			}
		}
		return remoteAddr || null;
	}

	private isAllowed(remoteIp: string, cidrs: string[]): boolean {
		let addr: ipaddr.IPv4 | ipaddr.IPv6;
		try {
			addr = ipaddr.process(remoteIp); // normalises IPv4-mapped IPv6 → IPv4
		} catch {
			return false;
		}

		for (const cidr of cidrs) {
			try {
				const [network, prefix] = ipaddr.parseCIDR(cidr);
				if (addr.kind() === network.kind() && addr.match(network, prefix)) {
					return true;
				}
			} catch {
				// Malformed CIDR — skip silently
			}
		}
		return false;
	}

	private deny(res: Response, message: string) {
		res.status(403).json({ statusCode: 403, message });
	}
}
