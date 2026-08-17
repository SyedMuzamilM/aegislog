import type { AuditRecord, LogEntry, LogLevel } from '../types.js';

// Zero-dependency ANSI color escape codes
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

const LEVEL_BADGES: Record<LogLevel, string> = {
  trace: `${ANSI.gray}[TRACE]${ANSI.reset}`,
  debug: `${ANSI.magenta}[DEBUG]${ANSI.reset}`,
  info: `${ANSI.cyan}[INFO]${ANSI.reset} `,
  warn: `${ANSI.yellow}${ANSI.bold}[WARN]${ANSI.reset} `,
  error: `${ANSI.red}${ANSI.bold}[ERROR]${ANSI.reset}`,
  fatal: `${ANSI.bgRed}${ANSI.white}${ANSI.bold} FATAL ${ANSI.reset}`,
};

export function formatDevLog(entry: LogEntry): string {
  const time = `${ANSI.gray}${entry.timestamp.split('T')[1]?.replace('Z', '') || entry.timestamp}${ANSI.reset}`;
  const badge = LEVEL_BADGES[entry.level] || `[${entry.level.toUpperCase()}]`;
  const ns = entry.namespace ? `${ANSI.blue}(${entry.namespace})${ANSI.reset} ` : '';

  let contextTag = '';
  if (entry.context) {
    const parts: string[] = [];
    if (entry.context.actor?.id) {
      const email = entry.context.actor.email ? ` <${entry.context.actor.email}>` : '';
      parts.push(`👤 ${entry.context.actor.id}${email}`);
    }
    if (entry.context.tenant?.id) {
      parts.push(`🏢 ${entry.context.tenant.slug || entry.context.tenant.id}`);
    }
    if (entry.context.requestId) {
      parts.push(`🆔 ${entry.context.requestId.slice(0, 8)}`);
    }
    if (parts.length > 0) {
      contextTag = ` ${ANSI.dim}[${parts.join(' | ')}]${ANSI.reset}`;
    }
  }

  let out = `${time} ${badge} ${ns}${entry.message}${contextTag}`;

  if (entry.meta && Object.keys(entry.meta).length > 0) {
    const formattedMeta = JSON.stringify(entry.meta, null, 2)
      .split('\n')
      .map((line) => `  ${ANSI.dim}${line}${ANSI.reset}`)
      .join('\n');
    out += `\n${formattedMeta}`;
  }

  if (entry.error) {
    const errObj = entry.error instanceof Error ? entry.error : (entry.error as { name?: string; message: string; stack?: string });
    const stack = errObj.stack
      ? errObj.stack
          .split('\n')
          .slice(1)
          .map((line) => (line.includes('node_modules') ? `${ANSI.gray}${line}${ANSI.reset}` : `${ANSI.red}${line}${ANSI.reset}`))
          .join('\n')
      : '';
    out += `\n  ${ANSI.red}${ANSI.bold}${errObj.name || 'Error'}: ${errObj.message}${ANSI.reset}\n${stack}`;
  }

  return out;
}

export function formatDevAudit(record: AuditRecord): string {
  const time = `${ANSI.gray}${record.timestamp ? record.timestamp.split('T')[1]?.replace('Z', '') : ''}${ANSI.reset}`;
  const badge = `${ANSI.bgMagenta}${ANSI.white}${ANSI.bold} AUDIT ${ANSI.reset}`;
  const action = `${ANSI.bold}${record.action}${ANSI.reset}`;
  const outcomeColor = record.outcome === 'success' ? ANSI.green : record.outcome === 'denied' ? ANSI.yellow : ANSI.red;
  const outcomeBadge = `${outcomeColor}[${(record.outcome || 'SUCCESS').toUpperCase()}]${ANSI.reset}`;

  const actorStr = record.actor?.id ? `${ANSI.cyan}${record.actor.email || record.actor.id}${ANSI.reset}` : 'system';
  const resourceStr = `${record.resource.type}:${ANSI.bold}${record.resource.id}${ANSI.reset}`;

  let out = `${time} ${badge} ${outcomeBadge} ${actorStr} ➔ ${action} on ${resourceStr}`;

  if (record.changes) {
    out += `\n  ${ANSI.dim}Changes:${ANSI.reset} ${JSON.stringify(record.changes)}`;
  }
  if (record.details) {
    out += `\n  ${ANSI.dim}Details:${ANSI.reset} ${JSON.stringify(record.details)}`;
  }

  return out;
}
