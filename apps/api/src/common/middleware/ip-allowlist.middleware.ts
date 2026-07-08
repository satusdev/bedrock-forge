import { Injectable, NestMiddleware, Logger, UnauthorizedException } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import * as ipaddr from "ipaddr.js";
import { JwtService } from "@nestjs/jwt";
import { SettingsRepository } from "../../modules/settings/settings.repository";

// Docker/localhost CIDRs that are always allowed regardless of user config
const ALWAYS_ALLOWED_CIDRS = [
  "127.0.0.0/8",
  "::1/128",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
];

@Injectable()
export class IpAllowlistMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IpAllowlistMiddleware.name);

  // 60-second in-memory cache so we don't hit the DB on every request.
  // Stored as a Promise to prevent cache stampedes under concurrent load:
  // all requests that arrive while a DB fetch is in-flight share the same
  // Promise rather than each firing their own query.
  private cachePromise: Promise<string[]> | null = null;
  private cacheExpiresAt = 0;

  constructor(
    private readonly settingsRepo: SettingsRepository,
    private readonly jwtService: JwtService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Check if request is authenticated with a valid JWT token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      try {
        const payload = this.jwtService.verify(token);
        if (payload) {
          return next();
        }
      } catch (err) {
        // Token verification failed or expired.
        // Throw 401 Unauthorized so the API client can intercept it, refresh the token
        // using the refresh cookie (which is allowed by the IP allowlist), and retry.
        throw new UnauthorizedException("Session expired or invalid token");
      }
    }

    let userCidrs: string[];
    try {
      userCidrs = await this.getUserCidrs();
    } catch (err) {
      this.logger.error(
        `IP allowlist check failed — fail closed: ${err instanceof Error ? err.message : String(err)}`,
      );
      const remoteIp = this.extractIp(req);
      if (remoteIp && this.isAllowed(remoteIp, ALWAYS_ALLOWED_CIDRS)) {
        return next();
      }
      return this.deny(res, "Access denied: Security verification database is offline");
    }

    // Empty allowlist = feature disabled, allow all
    if (userCidrs.length === 0) return next();

    const remoteIp = this.extractIp(req);
    if (!remoteIp) {
      this.logger.warn("Could not determine remote IP, blocking request");
      return this.deny(res, "Could not determine client IP");
    }

    if (this.isAllowed(remoteIp, [...ALWAYS_ALLOWED_CIDRS, ...userCidrs])) {
      return next();
    }

    this.logger.warn(`IP allowlist: blocked ${remoteIp}`);
    return this.deny(res, "Access denied by IP allowlist");
  }

  private async getUserCidrs(): Promise<string[]> {
    const now = Date.now();
    if (this.cachePromise && this.cacheExpiresAt > now) {
      return this.cachePromise;
    }
    // Start a new fetch and cache the promise immediately so concurrent
    // requests wait on the same in-flight DB call.
    this.cacheExpiresAt = now + 60_000;
    this.cachePromise = this.settingsRepo
      .findByKey("security_ip_allowlist")
      .then((setting) =>
        setting ? (JSON.parse(setting.value) as string[]) : [],
      )
      .catch((err) => {
        // On error, expire the cache immediately so the next request retries.
        this.cacheExpiresAt = 0;
        this.cachePromise = null;
        throw err;
      });
    return this.cachePromise;
  }

  private extractIp(req: Request): string | null {
    const remoteAddr = req.socket.remoteAddress ?? "";
    // Only honour X-Forwarded-For when the TCP connection came from a trusted
    // proxy (Docker/nginx/localhost). Without this check, any client could send
    // X-Forwarded-For: 127.0.0.1 and bypass the allowlist entirely.
    if (this.isAllowed(remoteAddr, ALWAYS_ALLOWED_CIDRS)) {
      const forwarded = req.headers["x-forwarded-for"];
      if (forwarded) {
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
          .split(",")[0]
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
