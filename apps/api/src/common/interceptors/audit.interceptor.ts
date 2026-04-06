import {
	CallHandler,
	ExecutionContext,
	Injectable,
	Logger,
	NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

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
		if (req.method === 'GET') return next.handle();

		return next.handle().pipe(
			tap(() => {
				this.writeLog(req).catch(err =>
					this.logger.warn(`Audit log write failed: ${err?.message}`),
				);
			}),
		);
	}

	private async writeLog(req: Request): Promise<void> {
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
				},
			},
		});
	}

	private buildAction(method: string, path: string): string {
		const resource = this.parseResource(path).resourceType ?? 'resource';
		const verb =
			{ POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }[
				method
			] ?? method.toLowerCase();
		return `${resource}.${verb}`;
	}

	/** Parse /api/backups/42 → { resourceType: 'backup', resourceId: 42 } */
	private parseResource(path: string): {
		resourceType: string | null;
		resourceId: number | null;
	} {
		// Strip /api/ prefix
		const seg = path.replace(/^\/api\//, '').split('/');
		if (!seg[0]) return { resourceType: null, resourceId: null };

		// Singularize the first segment (e.g. backups → backup)
		const resourceType = seg[0].replace(/s$/, '');

		// The second segment is the ID if it's numeric
		const maybeId = seg[1] ? parseInt(seg[1], 10) : NaN;
		const resourceId = isNaN(maybeId) ? null : maybeId;

		return { resourceType, resourceId };
	}

	private extractIp(req: Request): string {
		const forwarded = req.headers['x-forwarded-for'];
		if (forwarded) {
			const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
			return first.split(',')[0].trim();
		}
		return req.socket?.remoteAddress ?? 'unknown';
	}
}
