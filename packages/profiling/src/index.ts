import { context, ROOT_CONTEXT } from "@opentelemetry/api";
import { NodeSDK, resources } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  SamplingDecision,
  TraceIdRatioBasedSampler,
  type Sampler,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { MongoDBInstrumentation } from "@opentelemetry/instrumentation-mongodb";
import { MongooseInstrumentation } from "@opentelemetry/instrumentation-mongoose";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { MongoDBPoolInstrumentation } from "./mongodb-pool.instrumentation.js";
import { profileContextKey, RequestProfile, RequestProfileProcessor } from "./profiling.js";

export {
  coveredMs,
  profileOperation,
  profileSync,
  profileMiddleware,
  profileContextKey,
  RequestProfile,
  RequestProfileProcessor,
  tracer,
  scrubSpan,
} from "./profiling.js";
export type { ProfileOperation, ProfileSnapshot } from "./profiling.js";
export { MongoDBPoolInstrumentation } from "./mongodb-pool.instrumentation.js";

export interface ProfilingOptions {
  enabled?: boolean;
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  sampleRate?: number;
  maxSpans?: number;
  otlp?: { endpoint: string; headers?: Record<string, string>; timeoutMillis?: number };
  /** Additional processors run after the privacy scrubber. Do not register a second global SDK. */
  spanProcessors?: SpanProcessor[];
  instrumentations?: {
    http?: boolean;
    express?: boolean;
    mongodb?: boolean;
    mongoose?: boolean;
    redis?: boolean;
    undici?: boolean;
  };
}

export interface ProfilingRuntime {
  readonly enabled: boolean;
  readonly sampleRate: number;
  readonly maxSpans: number;
  shutdown(): Promise<void>;
}

let running = false;

/** Start before loading Express, MongoDB, Mongoose, Redis or HTTP client modules. */
export function startProfiling(options: ProfilingOptions = {}): ProfilingRuntime {
  const enabled = options.enabled ?? true;
  const sampleRate = options.sampleRate ?? 1;
  const maxSpans = options.maxSpans ?? 200;
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1)
    throw new RangeError("sampleRate must be between 0 and 1");
  if (!Number.isInteger(maxSpans) || maxSpans < 1 || maxSpans > 1000)
    throw new RangeError("maxSpans must be an integer between 1 and 1000");
  if (options.otlp) {
    const url = new URL(options.otlp.endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw new Error("OTLP endpoint must be an HTTP(S) URL without embedded credentials");
  }
  if (!enabled) return { enabled, sampleRate, maxSpans, async shutdown() {} };
  if (running)
    throw new Error("A profiling runtime or OpenTelemetry provider is already registered");

  // Remote callers cannot override local sampling through traceparent flags.
  const ratio = new TraceIdRatioBasedSampler(sampleRate);
  const parents = new ParentBasedSampler({
    root: ratio,
    remoteParentSampled: ratio,
    remoteParentNotSampled: ratio,
  });
  const sampler: Sampler = {
    shouldSample(...args) {
      const profile = args[0].getValue(profileContextKey) as RequestProfile | undefined;
      if (profile && (profile.closed || profile.operations.size >= profile.maxSpans)) {
        if (!profile.closed) profile.droppedSpans++;
        return { decision: SamplingDecision.NOT_RECORD };
      }
      return parents.shouldSample(...args);
    },
    toString: () => "AegisRequestSampler",
  };
  const on = options.instrumentations ?? {};
  const sdk = new NodeSDK({
    serviceName: options.serviceName ?? "aegislog-service",
    resource: resources.resourceFromAttributes({
      ...(options.serviceVersion ? { "service.version": options.serviceVersion } : {}),
      ...(options.environment ? { "deployment.environment.name": options.environment } : {}),
    }),
    autoDetectResources: false,
    metricReaders: [],
    logRecordProcessors: [],
    sampler,
    spanProcessors: [
      new RequestProfileProcessor(),
      ...(options.spanProcessors ?? []),
      ...(options.otlp
        ? [
            new BatchSpanProcessor(
              new OTLPTraceExporter({
                url: options.otlp.endpoint,
                headers: options.otlp.headers,
                timeoutMillis: options.otlp.timeoutMillis ?? 3000,
              }),
              { maxQueueSize: 1024, maxExportBatchSize: 128, scheduledDelayMillis: 2000 },
            ),
          ]
        : []),
    ],
    instrumentations: [
      ...(on.http === false
        ? []
        : [
            new HttpInstrumentation({
              disableIncomingRequestInstrumentation: true,
              requireParentforOutgoingSpans: true,
            }),
          ]),
      ...(on.express === false
        ? []
        : [
            new ExpressInstrumentation({
              ignoreLayers: [(name) => name.startsWith("router - ")],
              requestHook(_span, info) {
                const profile = context.active().getValue(profileContextKey) as
                  | RequestProfile
                  | undefined;
                if (profile && info.layerType === "request_handler")
                  profile.routeTemplate = info.route;
              },
            }),
          ]),
      ...(on.mongodb === false
        ? []
        : [
            new MongoDBInstrumentation({
              requireParentSpan: true,
              enhancedDatabaseReporting: false,
              dbStatementSerializer: () => "",
            }),
            new MongoDBPoolInstrumentation(),
          ]),
      ...(on.mongoose === false
        ? []
        : [
            new MongooseInstrumentation({
              requireParentSpan: true,
              suppressInternalInstrumentation: false,
              dbStatementSerializer: () => "",
            }),
          ]),
      ...(on.redis === false
        ? []
        : [
            new IORedisInstrumentation({
              requireParentSpan: true,
              dbStatementSerializer: () => "",
            }),
          ]),
      ...(on.undici === false ? [] : [new UndiciInstrumentation({ requireParentforSpans: true })]),
    ],
  });
  sdk.start();
  running = true;
  let shutdown: Promise<void> | undefined;
  return {
    enabled,
    sampleRate,
    maxSpans,
    shutdown() {
      return (shutdown ??= context.with(ROOT_CONTEXT, () => sdk.shutdown()));
    },
  };
}
