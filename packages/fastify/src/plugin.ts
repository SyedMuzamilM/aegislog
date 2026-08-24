import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import {
  type ActorContext,
  type TenantContext,
  generateId,
  logger as defaultLogger,
  runWithContext,
  type AegisLogger,
} from "aegislog";

export interface FastifyAegisOptions {
  logger?: AegisLogger;
  getActor?: (req: FastifyRequest) => ActorContext | undefined | Promise<ActorContext | undefined>;
  getTenant?: (
    req: FastifyRequest,
  ) => TenantContext | undefined | Promise<TenantContext | undefined>;
  logRequests?: boolean;
}

async function aegisFastifyPluginFn(
  fastify: FastifyInstance,
  options: FastifyAegisOptions = {},
): Promise<void> {
  const log = options.logger ?? defaultLogger;
  const logRequests = options.logRequests ?? true;

  fastify.addHook(
    "onRequest",
    (req: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
      const requestIdHeader = req.headers["x-request-id"];
      const requestId =
        (Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader) ?? generateId();

      const rawTraceHeader = req.headers["traceparent"] || req.headers["x-trace-id"];
      const traceHeader = Array.isArray(rawTraceHeader) ? rawTraceHeader[0] : rawTraceHeader;
      const traceId = traceHeader ? traceHeader.split("-")[1] || traceHeader : undefined;
      const ip = req.ip || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim();
      const userAgent = req.headers["user-agent"] as string;

      const requestState = req as unknown as {
        __aegisStart: number;
        __aegisRequestId: string;
      };
      requestState.__aegisStart = performance.now();
      requestState.__aegisRequestId = requestId;

      const actorPromise = options.getActor
        ? Promise.resolve(options.getActor(req))
        : Promise.resolve(undefined);
      const tenantPromise = options.getTenant
        ? Promise.resolve(options.getTenant(req))
        : Promise.resolve(undefined);

      Promise.all([actorPromise, tenantPromise])
        .then(([actor, tenant]) => {
          runWithContext(
            {
              requestId,
              traceId,
              actor,
              tenant,
              session: { id: requestId, ip, userAgent },
            },
            () => {
              if (logRequests) {
                log.debug(`--> ${req.method} ${req.url}`);
              }
              done();
            },
          );
        })
        .catch((err) => done(err instanceof Error ? err : new Error(String(err))));
    },
  );

  fastify.addHook("onResponse", async (req: FastifyRequest, reply: FastifyReply) => {
    const requestState = req as unknown as {
      __aegisStart?: number;
      __aegisRequestId?: string;
    };
    log.completeRequest(reply.statusCode, requestState.__aegisRequestId ?? req.id);
    if (!logRequests) return;
    const start = requestState.__aegisStart ?? performance.now();
    const duration = Number((performance.now() - start).toFixed(2));
    const status = reply.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const msg = `<-- ${req.method} ${req.url} ${status} in ${duration}ms`;

    if (level === "error") {
      log.error(msg, { status, durationMs: duration });
    } else if (level === "warn") {
      log.warn(msg, { status, durationMs: duration });
    } else {
      log.info(msg, { status, durationMs: duration });
    }
  });
}

export const aegisFastifyPlugin: FastifyPluginAsync<FastifyAegisOptions> = fp(
  aegisFastifyPluginFn,
  {
    name: "aegislog-fastify",
    fastify: "4.x || 5.x",
  },
);
