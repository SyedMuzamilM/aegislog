import type { Request, Response, NextFunction } from 'express';
import { type ActorContext, type TenantContext, logger, runWithContext } from 'aegislog';

export interface ExpressAegisOptions {
  getActor?: (req: Request) => ActorContext | undefined | Promise<ActorContext | undefined>;
  getTenant?: (req: Request) => TenantContext | undefined | Promise<TenantContext | undefined>;
  logRequests?: boolean;
}

export function aegisExpressMiddleware(
  options: ExpressAegisOptions = {}
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const logRequests = options.logRequests ?? true;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId =
      (req.headers['x-request-id'] as string) ||
      `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

    const traceHeader = (req.headers['traceparent'] || req.headers['x-trace-id']) as string;
    const traceId = traceHeader ? traceHeader.split('-')[1] || traceHeader : undefined;

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress;

    const userAgent = req.headers['user-agent'] as string;

    const actor = options.getActor ? await options.getActor(req) : undefined;
    const tenant = options.getTenant ? await options.getTenant(req) : undefined;

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
          logger.debug(`--> ${req.method} ${req.originalUrl || req.url}`);
        }

        res.on('finish', () => {
          if (!logRequests) return;
          const duration = Number((performance.now() - start).toFixed(2));
          const status = res.statusCode;
          const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
          const msg = `<-- ${req.method} ${req.originalUrl || req.url} ${status} in ${duration}ms`;

          if (level === 'error') {
            logger.error(msg, { status, durationMs: duration });
          } else if (level === 'warn') {
            logger.warn(msg, { status, durationMs: duration });
          } else {
            logger.info(msg, { status, durationMs: duration });
          }
        });

        next();
      }
    );
  };
}
