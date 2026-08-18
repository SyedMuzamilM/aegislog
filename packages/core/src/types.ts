export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

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

export type ShieldPatternReplacer = string | ((substring: string, ...args: unknown[]) => string);

export interface CustomPatternRule {
  pattern: RegExp;
  replacer?: ShieldPatternReplacer;
}

export type ShieldPattern = RegExp | CustomPatternRule;

export type ShieldPreset = "hipaa" | "healthcare" | "pci" | "financial" | "strict";

export interface ShieldOptions {
  enabled?: boolean;
  preset?: ShieldPreset | ShieldPreset[];
  maskString?: string;
  additionalKeys?: string[];
  customPatterns?: ShieldPattern[];
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
  outcome?: "success" | "failure" | "denied";
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

export interface DevDisplayOptions {
  /**
   * Visual preset: 'default' | 'minimal' | 'compact' | 'detailed'
   * default: 'default'
   */
  preset?: "default" | "minimal" | "compact" | "detailed";

  /**
   * Display emojis/icons (ℹ️, ⚠️, 🚨, 💥, 🔍, 🤖, 🛡️, 👤, 🏢, 🆔, ⚡)
   * default: true
   */
  icons?: boolean;

  /**
   * Display timestamp ('time-only' | 'iso' | boolean)
   * default: 'time-only'
   */
  timestamp?: "time-only" | "iso" | boolean;

  /**
   * Display context badges ([👤 user | 🏢 tenant | 🆔 reqId])
   * default: true
   */
  context?:
    | boolean
    | {
        actor?: boolean;
        tenant?: boolean;
        requestId?: boolean;
        session?: boolean;
        tags?: boolean;
      };

  /**
   * Colorize terminal output with ANSI colors
   * default: true
   */
  colorize?: boolean;

  /**
   * Colorize JSON metadata with syntax highlighting
   * default: true
   */
  colorizeMeta?: boolean;

  /**
   * Max depth to format for nested metadata
   * default: 4
   */
  depth?: number;

  /**
   * Custom filter for metadata keys
   */
  filterMeta?: (key: string, value: unknown) => boolean;

  /**
   * Custom badges/labels for log levels
   */
  badges?: Partial<Record<LogLevel, string>>;
}

export interface DevViewerSinkOptions {
  port?: number;
  host?: string;
}

export interface LoggerOptions {
  level?: LogLevel;
  namespace?: string;
  format?: "auto" | "pretty" | "json";
  shield?: ShieldOptions;
  display?: DevDisplayOptions;
  ringBuffer?: RingBufferOptions;
  sinks?: LogSink[];
  defaultMeta?: Record<string, unknown>;
  dev?: boolean | DevViewerSinkOptions;
  gracefulShutdown?: boolean;
}
