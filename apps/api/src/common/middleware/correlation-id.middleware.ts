import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { correlationIdStorage } from "../logging/correlation-id.context";

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers["x-correlation-id"] as string) || randomUUID();
    res.setHeader("x-correlation-id", correlationId);
    correlationIdStorage.run(correlationId, () => {
      next();
    });
  }
}
