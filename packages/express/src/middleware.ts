import type { NextFunction, Request, Response } from "express";
import {
  type ActorContext,
  type AegisLogger,
  type TenantContext,
  generateId,
  logger,
  parseTraceParent,
  runWithContext,
} from "aegislog";

export interface RequestTiming {
  /**
   * Record a completed phase duration in milliseconds
   */
  record(phase: string, durationMs: number, description?: string): void;
  /**
   * Measure execution time of a synchronous or asynchronous operation
   */
  time<T>(phase: string, fn: () => Promise<T> | T, description?: string): Promise<T>;
  /**
   * Get map of recorded phase timings in milliseconds
   */
  getPhases(): Record<string, number>;
  /**
   * Format W3C Server-Timing header string
   */
  formatServerTiming(totalMs?: number): string;
}

export function createRequestTiming(): RequestTiming {
  const phases = new Map<string, { durationMs: number; description?: string }>();

  return {
    record(phase: string, durationMs: number, description?: string) {
      phases.set(phase, { durationMs: Math.max(0, Number(durationMs.toFixed(2))), description });
    },
    async time<T>(phase: string, fn: () => Promise<T> | T, description?: string): Promise<T> {
      const start = performance.now();
      try {
        return await fn();
      } finally {
        const dur = Number((performance.now() - start).toFixed(2));
        phases.set(phase, { durationMs: dur, description });
      }
    },
    getPhases() {
      const res: Record<string, number> = {};
      for (const [k, v] of phases.entries()) {
        res[k] = v.durationMs;
      }
      return res;
    },
    formatServerTiming(totalMs?: number) {
      const parts: string[] = [];
      if (typeof totalMs === "number") {
        parts.push(`total;dur=${totalMs.toFixed(2)};desc="Total"`);
      }
      for (const [name, p] of phases.entries()) {
        const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
        const desc = p.description ? `;desc="${p.description.replace(/"/g, "'")}"` : "";
        parts.push(`${sanitized};dur=${p.durationMs}${desc}`);
      }
      return parts.join(", ");
    },
  };
}

export function getRequestTiming(res: Response): RequestTiming | undefined {
  return res.locals?.timing || (res as any).timing;
}

export interface ExpressAegisOptions {
  logger?: AegisLogger;
  getActor?: (req: Request) => ActorContext | undefined | Promise<ActorContext | undefined>;
  getTenant?: (req: Request) => TenantContext | undefined | Promise<TenantContext | undefined>;
  logRequests?: boolean;
  /**
   * Whether to automatically inject W3C Server-Timing header (default: true)
   */
  serverTiming?: boolean;
}

export function aegisExpressMiddleware(
  options: ExpressAegisOptions = {},
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const logRequests = options.logRequests ?? true;
  const serverTiming = options.serverTiming ?? true;
  const activeLogger = options.logger ?? logger;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestIdHeader = req.headers["x-request-id"];
    const requestId =
      (Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader) ?? generateId();

    const rawTraceHeader = req.headers["traceparent"] || req.headers["x-trace-id"];
    const traceHeader = Array.isArray(rawTraceHeader) ? rawTraceHeader[0] : rawTraceHeader;
    const parsedTrace = traceHeader ? parseTraceParent(traceHeader) : undefined;
    const traceId =
      parsedTrace?.traceId ?? (traceHeader ? traceHeader.split("-")[1] || traceHeader : undefined);
    const spanId = parsedTrace?.spanId;

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
        spanId,
        actor,
        tenant,
        session: { id: requestId, ip, userAgent },
      },
      () => {
        const start = performance.now();
        const timing = createRequestTiming();
        res.locals = res.locals || {};
        res.locals.timing = timing;
        (res as any).timing = timing;

        if (serverTiming) {
          const originalWriteHead = res.writeHead.bind(res);
          (res as any).writeHead = function (statusCode: number, ...args: any[]) {
            if (!res.headersSent) {
              const elapsed = Number((performance.now() - start).toFixed(2));
              const existingTiming = res.getHeader("Server-Timing");
              const currentTimingStr = timing.formatServerTiming(elapsed);
              const headerVal = existingTiming
                ? `${existingTiming}, ${currentTimingStr}`
                : currentTimingStr;
              res.setHeader("Server-Timing", headerVal);
              if (!res.getHeader("Timing-Allow-Origin")) {
                res.setHeader("Timing-Allow-Origin", "*");
              }
            }
            return (originalWriteHead as any)(statusCode, ...args);
          };
        }

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
          const route = req.route?.path || req.baseUrl + (req.route?.path || "") || req.path;
          const phases = timing.getPhases();

          const logMeta = {
            status,
            statusCode: status,
            durationMs: duration,
            method: req.method,
            route,
            path: req.originalUrl || req.url,
            phases: Object.keys(phases).length > 0 ? phases : undefined,
          };

          if (level === "error") {
            activeLogger.error(msg, logMeta);
          } else if (level === "warn") {
            activeLogger.warn(msg, logMeta);
          } else {
            activeLogger.info(msg, logMeta);
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
