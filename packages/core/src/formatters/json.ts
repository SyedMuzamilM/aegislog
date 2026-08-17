import type { AuditRecord, LogEntry } from '../types.js';

export function formatJsonLog(entry: LogEntry): string {
  const payload: Record<string, unknown> = {
    timestamp: entry.timestamp,
    level: entry.level,
    message: entry.message,
  };

  if (entry.namespace) {
    payload.namespace = entry.namespace;
  }

  if (entry.context) {
    if (entry.context.requestId) payload.requestId = entry.context.requestId;
    if (entry.context.traceId) payload.traceId = entry.context.traceId;
    if (entry.context.spanId) payload.spanId = entry.context.spanId;
    if (entry.context.actor) payload.actor = entry.context.actor;
    if (entry.context.tenant) payload.tenant = entry.context.tenant;
    if (entry.context.session) payload.session = entry.context.session;
    if (entry.context.tags && Object.keys(entry.context.tags).length > 0) {
      payload.tags = entry.context.tags;
    }
  }

  if (entry.meta && Object.keys(entry.meta).length > 0) {
    payload.meta = entry.meta;
  }

  if (entry.error) {
    payload.error =
      entry.error instanceof Error
        ? {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
          }
        : entry.error;
  }

  return JSON.stringify(payload);
}

export function formatJsonAudit(record: AuditRecord): string {
  return JSON.stringify({
    type: 'audit',
    ...record,
  });
}
