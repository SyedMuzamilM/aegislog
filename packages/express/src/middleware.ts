import type { NextFunction, Request, Response } from "express";
import {
  type ActorContext,
  type AegisLogger,
  type TenantContext,
  generateId,
  logger,
  runWithContext,
} from "aegislog";

export interface ExpressAegisOptions {
  logger?: AegisLogger;
  getActor?: (req: Request) => ActorContext | undefined | Promise<ActorContext | undefined>;
  getTenant?: (req: Request) => TenantContext | undefined | Promise<TenantContext | undefined>;
  logRequests?: boolean;
}

export function aegisExpressMiddleware(
  options: ExpressAegisOptions = {},
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const logRequests = options.logRequests ?? true;
  const activeLogger = options.logger ?? logger;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestIdHeader = req.headers["x-request-id"];
    const requestId =
      (Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader) ?? generateId();

    const rawTraceHeader = req.headers["traceparent"] || req.headers["x-trace-id"];
    const traceHeader = Array.isArray(rawTraceHeader) ? rawTraceHeader[0] : rawTraceHeader;
    const traceId = traceHeader ? traceHeader.split("-")[1] || traceHeader : undefined;

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      req.socket.remoteAddress;

    const userAgent = req.headers["user-agent"] as string;

    let actor: ActorContext | undefined;
    let tenant: TenantContext | undefined;
    try {
      [actor, tenant] = await Promise.all([options.getActor?.(req), options.getTenant?.(req)]);
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    runWithContext(
      {
        requestId,
        traceId,
        actor,
        tenant,
        session: { id: requestId, ip, userAgent },
      },
      () => {
        const start = performance.now();

        if (logRequests) {
          activeLogger.debug(`--> ${req.method} ${req.originalUrl || req.url}`);
        }

        let finished = false;
        res.on("finish", () => {
          finished = true;
          activeLogger.completeRequest(res.statusCode, requestId);
          if (!logRequests) return;
          const duration = Number((performance.now() - start).toFixed(2));
          const status = res.statusCode;
          const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
          const msg = `<-- ${req.method} ${req.originalUrl || req.url} ${status} in ${duration}ms`;

          if (level === "error") {
            activeLogger.error(msg, { status, durationMs: duration });
          } else if (level === "warn") {
            activeLogger.warn(msg, { status, durationMs: duration });
          } else {
            activeLogger.info(msg, { status, durationMs: duration });
          }
        });
        res.on("close", () => {
          if (finished) return;
          activeLogger.completeRequest(500, requestId);
          if (!logRequests) return;
          activeLogger.error(`<-- ${req.method} ${req.originalUrl || req.url} connection closed`, {
            status: res.statusCode,
          });
        });

        next();
      },
    );
  };
}
