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

    const fullRecord = this.shield.sanitize<AuditRecord>({
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
    });

    const results = await Promise.allSettled(
      this.sinks
        .filter((sink) => sink.logAudit)
        .map((sink) => Promise.resolve().then(() => sink.logAudit?.(fullRecord))),
    );
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);
    if (errors.length > 0) {
      throw new AggregateError(errors, "One or more audit sinks failed");
    }
  }
}
