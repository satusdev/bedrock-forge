import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { Request } from "express";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * AuditInterceptor
 *
 * Automatically writes a row to audit_logs for every non-GET HTTP request that
 * completes successfully.  Audit failures are swallowed — they must never cause
 * the original response to fail.
 *
 * resource_type and resource_id are inferred from the URL path:
 *   /api/backups/42       → type=backup, id=42
 *   /api/projects         → type=project, id=null
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();

    // Only audit write operations
    if (req.method === "GET") return next.handle();

    return next.handle().pipe(
      tap({
        next: () => {
          this.writeLog(req, "success").catch((err) => {
            this.logAuditWriteFailure(req, "success", err);
          });
        },
        error: (err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.writeLog(req, "failure", errMsg).catch((e) => {
            this.logAuditWriteFailure(req, "failure", e);
          });
        },
      }),
    );
  }

  private logAuditWriteFailure(
    req: Request,
    outcome: "success" | "failure",
    err: unknown,
  ): void {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    this.logger.error(
      `Audit log write failed for ${req.method} ${req.path} after ${outcome}: ${message}`,
      stack,
    );
  }

  private async writeLog(
    req: Request,
    outcome: "success" | "failure" = "success",
    errorMsg?: string,
  ): Promise<void> {
    const user = (req as Request & { user?: { id: number; email: string } })
      .user;

    const action = this.buildAction(req.method, req.path);
    const { resourceType, resourceId } = this.parseResource(req.path);
    const ip = this.extractIp(req);

    await this.prisma.auditLog.create({
      data: {
        user_id: user?.id ? BigInt(user.id) : null,
        action,
        resource_type: resourceType,
        resource_id: resourceId ? BigInt(resourceId) : null,
        ip_address: ip,
        metadata: {
          method: req.method,
          path: req.path,
          userEmail: user?.email ?? null,
          outcome,
          ...(errorMsg ? { error: errorMsg } : {}),
        },
      },
    });
  }

  private buildAction(method: string, path: string): string {
    const resource = this.parseResource(path).resourceType ?? "resource";
    const verb =
      { POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" }[
        method
      ] ?? method.toLowerCase();
    return `${resource}.${verb}`;
  }

  /** Explicit plural → singular map for paths where strip-s is wrong. */
  private static readonly SINGULAR_MAP: Record<string, string> = {
    "audit-logs": "audit-log",
    backups: "backup",
    clients: "client",
    domains: "domain",
    environments: "environment",
    invoices: "invoice",
    jobs: "job",
    "job-executions": "job-execution",
    lighthouse: "lighthouse", // not pluralised — keep as-is
    "maintenance-windows": "maintenance-window",
    monitors: "monitor",
    notifications: "notification",
    plugins: "plugin",
    projects: "project",
    reports: "report",
    schedules: "schedule",
    security: "security",
    servers: "server",
    sessions: "session",
    settings: "setting",
    themes: "theme",
    users: "user",
  };

  /** Parse /api/backups/42 → { resourceType: 'backup', resourceId: 42 } */
  private parseResource(path: string): {
    resourceType: string | null;
    resourceId: number | null;
  } {
    // Strip /api/ prefix
    const seg = path.replace(/^\/api\//, "").split("/");
    if (!seg[0]) return { resourceType: null, resourceId: null };

    // Use the explicit map first; fall back to strip-trailing-s heuristic.
    const resourceType =
      AuditInterceptor.SINGULAR_MAP[seg[0]] ?? seg[0].replace(/s$/, "");

    // The second segment is the ID if it's numeric
    const maybeId = seg[1] ? parseInt(seg[1], 10) : NaN;
    const resourceId = isNaN(maybeId) ? null : maybeId;

    return { resourceType, resourceId };
  }

  private extractIp(req: Request): string {
    // X-Real-IP is set by nginx to $remote_addr (the actual connecting IP).
    // It cannot be injected by the client when nginx sits in front.
    // X-Forwarded-For is intentionally ignored here to prevent spoofing of
    // audit log entries by clients that inject arbitrary header values.
    const realIp = req.headers["x-real-ip"];
    if (realIp && typeof realIp === "string") {
      return realIp.trim();
    }
    // Fallback for direct connections (dev / health checks without nginx).
    return req.socket?.remoteAddress ?? "unknown";
  }
}
