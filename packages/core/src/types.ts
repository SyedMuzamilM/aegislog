export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface ActorContext {
  id: string;
  email?: string;
  role?: string;
  isSystem?: boolean;
  [key: string]: unknown;
}

export interface TenantContext {
  id: string;
  slug?: string;
  tier?: string;
  [key: string]: unknown;
}

export interface SessionContext {
  id: string;
  ip?: string;
  userAgent?: string;
  [key: string]: unknown;
}

export interface AegisContext {
  requestId: string;
  traceId?: string;
  spanId?: string;
  actor?: ActorContext;
  tenant?: TenantContext;
  session?: SessionContext;
  tags?: Record<string, string>;
  data?: Record<string, unknown>;
}

export interface ShieldOptions {
  enabled?: boolean;
  maskString?: string;
  additionalKeys?: string[];
  maskCreditCards?: boolean;
  maskTokens?: boolean;
  maskJwt?: boolean;
  maxDepth?: number;
  maxStringLength?: number;
  customMasker?: (key: string, value: unknown) => unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  namespace?: string;
  context?: AegisContext;
  meta?: Record<string, unknown>;
  error?: Error | { name: string; message: string; stack?: string; cause?: unknown };
}

export interface AuditRecord {
  eventId?: string;
  timestamp?: string;
  action: string;
  resource: {
    type: string;
    id: string;
    name?: string;
    [key: string]: unknown;
  };
  actor?: ActorContext;
  tenant?: TenantContext;
  session?: SessionContext;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
  target?: { type: string; id: string; [key: string]: unknown };
  details?: Record<string, unknown>;
  reason?: string;
  outcome?: 'success' | 'failure' | 'denied';
  traceId?: string;
}

export interface LogSink {
  name: string;
  log: (entry: LogEntry) => void | Promise<void>;
  logAudit?: (record: AuditRecord) => void | Promise<void>;
  flush?: () => Promise<void>;
}

export interface RingBufferOptions {
  enabled?: boolean;
  capacity?: number;
  flushOnError?: boolean;
}

export interface LoggerOptions {
  level?: LogLevel;
  namespace?: string;
  format?: 'auto' | 'pretty' | 'json';
  shield?: ShieldOptions;
  ringBuffer?: RingBufferOptions;
  sinks?: LogSink[];
  defaultMeta?: Record<string, unknown>;
}
