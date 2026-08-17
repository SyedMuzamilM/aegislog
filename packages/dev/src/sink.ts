import type { AuditRecord, LogEntry, LogSink } from 'aegislog';

export interface DevViewerSinkOptions {
  port?: number;
  host?: string;
}

export class DevViewerSink implements LogSink {
  public name = 'dev-viewer';
  private url: string;

  constructor(options: DevViewerSinkOptions = {}) {
    const port = options.port ?? 4319;
    const host = options.host ?? '127.0.0.1';
    this.url = `http://${host}:${port}/api/events`;
  }

  public log(entry: LogEntry): void {
    void this.send(entry);
  }

  public logAudit(record: AuditRecord): void {
    void this.send(record);
  }

  private async send(payload: unknown): Promise<void> {
    try {
      if (typeof fetch !== 'undefined') {
        await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
    } catch {
      // Ignored if dev server is not running
    }
  }
}
