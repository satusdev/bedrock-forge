import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { Request, Response } from "express";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const { method, originalUrl, ip } = request;
    const userAgent = request.get("user-agent") || "";
    
    // Attempt to extract user info from request (populated by guards/auth)
    const user = (request as any).user;
    const userStr = user ? `user=${user.id ?? user.email}` : "user=anonymous";

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;
          this.logger.log(
            `${method} ${originalUrl} ${statusCode} - ${userAgent} - ${ip} - ${userStr} - ${duration}ms`,
          );
        },
        error: (err: any) => {
          const duration = Date.now() - startTime;
          const statusCode = err.status ?? 500;
          this.logger.error(
            `${method} ${originalUrl} ${statusCode} - ${userAgent} - ${ip} - ${userStr} - ${duration}ms - error: ${err.message || err}`,
          );
        },
      }),
    );
  }
}
