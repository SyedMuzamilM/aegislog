import type { AiTracker } from "./ai.js";
import type { AuditEngine } from "./audit.js";
import { AegisLogger, createLogger } from "./logger.js";

export * from "./types.js";
export * from "./context.js";
export * from "./shield.js";
export * from "./sinks.js";
export * from "./audit.js";
export * from "./ai.js";
export * from "./schema.js";
export * from "./formatters/dev.js";
export * from "./formatters/json.js";
export * from "./logger.js";

// Pre-configured global default logger instance
export const logger: AegisLogger = createLogger();

// Pre-configured default audit recorder
export const audit: AuditEngine = logger.audit;

// Pre-configured default AI tracker
export const ai: AiTracker = logger.ai;
