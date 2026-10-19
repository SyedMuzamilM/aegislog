import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { getContext, logger, runWithContext, type AegisLogger } from "aegislog";
import type { Request, RequestHandler, Response } from "express";
import type { ProfilingRuntime } from "./index.js";
import { profileContextKey, profileSync, RequestProfile, tracer } from "./profiling.js";

export interface ExpressProfilingOptions {
  logger?: AegisLogger;
  /** Return false for health checks, assets and paths you do not want to profile. */
  filter?: (request: Request) => boolean;
  /** Template route resolver; never return a raw URL containing identifiers. */
  route?: (request: Request) => string;
  environment?: string;
  eventName?: string;
  serverTiming?: boolean;
}

const safeRequestId = (id: unknown): string =>
  typeof id === "string" && /^[a-zA-Z0-9_.:-]{1,128}$/.test(id) ? id : randomUUID();

/** Mount before body parsers and authentication; startProfiling must run before Express imports. */
export function createExpressProfilingMiddleware(
  runtime: ProfilingRuntime,
  options: ExpressProfilingOptions = {},
): RequestHandler {
  const activeLogger = options.logger ?? logger;
  return (req, res, next) => {
    if (!runtime.enabled || options.filter?.(req) === false) return next();
    const root = tracer.startSpan(
      `${req.method} request`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.request.method": req.method,
          ...(options.environment ? { "deployment.environment.name": options.environment } : {}),
        },
      },
      propagation.extract(ROOT_CONTEXT, req.headers),
    );
    if (!root.isRecording()) {
      root.end();
      return next();
    }

    const requestId = safeRequestId(req.headers["x-request-id"]);
    req.headers["x-request-id"] = requestId;
    root.setAttribute("request.id", requestId);
    const start = performance.now();
    const profile = new RequestProfile(performance.timeOrigin + start, runtime.maxSpans);
    const ctx = trace.setSpan(context.active(), root).setValue(profileContextKey, profile);
    res.setHeader("x-request-id", requestId);
    res.setHeader("x-profile-trace-id", root.spanContext().traceId);
    const json = res.json;
    res.json = function (body) {
      return profileSync("response.json", "serialization", () => json.call(this, body));
    };
    const writeHead = res.writeHead;
    if (options.serverTiming !== false) {
      res.writeHead = function (this: Response, ...args: Parameters<typeof writeHead>) {
        if (!res.headersSent) {
          const snapshot = profile.snapshot(performance.now() - start);
          const timings = Object.entries(snapshot.categories).map(
            ([name, value]) =>
              `profile_${name.replace(/[^a-zA-Z0-9_-]/g, "_")};dur=${value.wallMs}`,
          );
          timings.unshift(`profile_headers;dur=${snapshot.totalMs}`);
          res.setHeader(
            "server-timing",
            [res.getHeader("server-timing"), ...timings].filter(Boolean).join(", "),
          );
        }
        return writeHead.apply(this, args);
      } as typeof writeHead;
    }
    let finished = false;
    const finish = (aborted: boolean) => {
      if (finished) return;
      finished = true;
      let route = "unmatched";
      try {
        route =
          options.route?.(req) ??
          profile.routeTemplate ??
          (typeof req.route?.path === "string" ? req.route.path : "unmatched");
      } catch {
        /* A route formatter cannot interrupt a response. */
      }
      root.updateName(`${req.method} ${route}`);
      root.setAttributes({ "http.route": route, "http.response.status_code": res.statusCode });
      if (aborted || res.statusCode >= 500) root.setStatus({ code: SpanStatusCode.ERROR });
      const breakdown = profile.snapshot(performance.now() - start);
      profile.closed = true;
      root.end();
      // Log outside the OTel request context, avoiding exporter/client recursion.
      const saved = getContext();
      context.with(ROOT_CONTEXT, () =>
        runWithContext(
          {
            ...saved,
            requestId,
            traceId: root.spanContext().traceId,
            spanId: root.spanContext().spanId,
          },
          () => {
            try {
              activeLogger.info(`Request completed in ${breakdown.totalMs}ms`, {
                event: options.eventName ?? "request_profile",
                requestId,
                traceId: root.spanContext().traceId,
                ...(options.environment ? { environment: options.environment } : {}),
                method: req.method,
                route,
                statusCode: res.statusCode,
                aborted,
                sampleRate: runtime.sampleRate,
                ...breakdown,
              });
            } catch {
              /* Telemetry must never change request behavior. */
            }
          },
        ),
      );
    };
    context.with(ctx, () =>
      runWithContext(
        {
          ...getContext(),
          requestId,
          traceId: root.spanContext().traceId,
          spanId: root.spanContext().spanId,
        },
        () => {
          res.once("finish", () => finish(false));
          res.once("close", () => finish(!res.writableFinished));
          next();
        },
      ),
    );
  };
}
