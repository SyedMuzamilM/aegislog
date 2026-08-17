import { generateId, getContext } from "./context.js";
import { SecurityShield } from "./shield.js";
import type { AuditRecord, LogSink } from "./types.js";

export class AuditEngine {
  private sinks: LogSink[];
  private shield: SecurityShield;

  constructor(sinks: LogSink[], shield: SecurityShield) {
    this.sinks = sinks;
    this.shield = shield;
  }

  public async record(record: AuditRecord): Promise<void> {
    const ambient = getContext();

    const fullRecord: AuditRecord = {
      eventId: record.eventId ?? `aud_${generateId()}`,
      timestamp: record.timestamp ?? new Date().toISOString(),
      action: record.action,
      resource: record.resource,
      actor: record.actor ?? ambient?.actor,
      tenant: record.tenant ?? ambient?.tenant,
      session: record.session ?? ambient?.session,
      traceId: record.traceId ?? ambient?.traceId,
      changes: record.changes
        ? (this.shield.sanitize(record.changes) as typeof record.changes)
        : undefined,
      target: record.target,
      details: record.details
        ? (this.shield.sanitize(record.details) as typeof record.details)
        : undefined,
      reason: record.reason,
      outcome: record.outcome ?? "success",
    };

    for (const sink of this.sinks) {
      if (sink.logAudit) {
        await sink.logAudit(fullRecord);
      }
    }
  }
}
