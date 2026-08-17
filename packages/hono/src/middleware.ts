import type { Context, MiddlewareHandler } from 'hono';
import { type ActorContext, type TenantContext, logger as defaultLogger, runWithContext, type AegisLogger } from 'aegislog';

export interface HonoAegisOptions {
  logger?: AegisLogger;
  getActor?: (c: Context) => ActorContext | undefined | Promise<ActorContext | undefined>;
  getTenant?: (c: Context) => TenantContext | undefined | Promise<TenantContext | undefined>;
  logRequests?: boolean;
}

export function aegisMiddleware(options: HonoAegisOptions = {}): MiddlewareHandler {
  const log = options.logger ?? defaultLogger;
  const logRequests = options.logRequests ?? true;

  return async (c, next) => {
    const getHdr = (key: string): string | undefined => {
      try {
        return c.req.header(key) || c.req.raw?.headers?.get(key) || undefined;
      } catch {
        return undefined;
      }
    };

    const requestId =
      getHdr('x-request-id') ||
      getHdr('cf-ray') ||
      `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

    const traceHeader = getHdr('traceparent') || getHdr('x-trace-id');
    const traceId = traceHeader ? traceHeader.split('-')[1] || traceHeader : undefined;

    const ip =
      getHdr('cf-connecting-ip') ||
      getHdr('x-real-ip') ||
      getHdr('x-forwarded-for')?.split(',')[0]?.trim();

    const userAgent = getHdr('user-agent');

    const actor = options.getActor ? await options.getActor(c) : undefined;
    const tenant = options.getTenant ? await options.getTenant(c) : undefined;

    return runWithContext(
      {
        requestId,
        traceId,
        actor,
        tenant,
        session: { id: requestId, ip, userAgent },
      },
      async () => {
        const start = performance.now();

        if (logRequests) {
          log.debug(`--> ${c.req.method} ${c.req.path}`);
        }

        try {
          await next();
        } catch (error) {
          const duration = Number((performance.now() - start).toFixed(2));
          log.error(`XX- ${c.req.method} ${c.req.path} failed in ${duration}ms`, {
            method: c.req.method,
            path: c.req.path,
            durationMs: duration,
            error: error instanceof Error ? error : new Error(String(error)),
          });
          throw error;
        }

        const duration = Number((performance.now() - start).toFixed(2));
        if (logRequests) {
          const status = c.res.status;
          const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
          if (level === 'error') {
            log.error(`<-- ${c.req.method} ${c.req.path} ${status} in ${duration}ms`, {
              status,
              durationMs: duration,
            });
          } else if (level === 'warn') {
            log.warn(`<-- ${c.req.method} ${c.req.path} ${status} in ${duration}ms`, {
              status,
              durationMs: duration,
            });
          } else {
            log.info(`<-- ${c.req.method} ${c.req.path} ${status} in ${duration}ms`, {
              status,
              durationMs: duration,
            });
          }
        }
      }
    );
  };
}
