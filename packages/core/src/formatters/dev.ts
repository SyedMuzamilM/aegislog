import type { AuditRecord, DevDisplayOptions, LogEntry, LogLevel } from "../types.js";

// Zero-dependency ANSI color escape codes
export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
  // Background colors
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

const DEFAULT_LEVEL_BADGES: Record<LogLevel, string> = {
  trace: `${ANSI.gray}[TRACE]${ANSI.reset}`,
  debug: `${ANSI.magenta}[DEBUG]${ANSI.reset}`,
  info: `${ANSI.cyan}[INFO]${ANSI.reset} `,
  warn: `${ANSI.yellow}${ANSI.bold}[WARN]${ANSI.reset} `,
  error: `${ANSI.red}${ANSI.bold}[ERROR]${ANSI.reset}`,
  fatal: `${ANSI.bgRed}${ANSI.white}${ANSI.bold} FATAL ${ANSI.reset}`,
};

const ICONS: Record<LogLevel | "audit" | "actor" | "tenant" | "request" | "ai", string> = {
  trace: "🔍",
  debug: "🐛",
  info: "ℹ️",
  warn: "⚠️",
  error: "🚨",
  fatal: "💥",
  audit: "🛡️",
  actor: "👤",
  tenant: "🏢",
  request: "🆔",
  ai: "🤖",
};

/**
 * Syntax-highlights a JavaScript object into colorized JSON for terminal display
 */
export function colorizeJson(obj: unknown, indent = 2, maxDepth = 4, currentDepth = 0): string {
  if (currentDepth > maxDepth) return `${ANSI.gray}[Object]${ANSI.reset}`;

  if (obj === null) return `${ANSI.gray}null${ANSI.reset}`;
  if (obj === undefined) return `${ANSI.gray}undefined${ANSI.reset}`;

  const type = typeof obj;
  if (type === "string") {
    return `${ANSI.green}"${obj}"${ANSI.reset}`;
  }
  if (type === "number") {
    return `${ANSI.yellow}${obj}${ANSI.reset}`;
  }
  if (type === "boolean") {
    return `${ANSI.magenta}${obj}${ANSI.reset}`;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const spaces = " ".repeat((currentDepth + 1) * indent);
    const endSpaces = " ".repeat(currentDepth * indent);
    const items = obj
      .map((item) => `${spaces}${colorizeJson(item, indent, maxDepth, currentDepth + 1)}`)
      .join(",\n");
    return `[\n${items}\n${endSpaces}]`;
  }

  if (type === "object") {
    const keys = Object.keys(obj as object);
    if (keys.length === 0) return "{}";
    const spaces = " ".repeat((currentDepth + 1) * indent);
    const endSpaces = " ".repeat(currentDepth * indent);
    const lines = keys.map((k) => {
      const keyStr = `${ANSI.cyan}"${k}"${ANSI.reset}: `;
      const valStr = colorizeJson(
        (obj as Record<string, unknown>)[k],
        indent,
        maxDepth,
        currentDepth + 1,
      );
      return `${spaces}${keyStr}${valStr}`;
    });
    return `{\n${lines.join(",\n")}\n${endSpaces}}`;
  }

  return String(obj);
}

export function formatDevLog(entry: LogEntry, options: DevDisplayOptions = {}): string {
  const showIcons = options.icons ?? true;
  const showColors = options.colorize ?? true;
  const preset = options.preset ?? "default";

  // 1. Timestamp
  let timeStr = "";
  if (options.timestamp !== false && preset !== "minimal") {
    const rawTime = entry.timestamp || new Date().toISOString();
    const formattedTime =
      options.timestamp === "iso" ? rawTime : rawTime.split("T")[1]?.replace("Z", "") || rawTime;
    timeStr = showColors ? `${ANSI.gray}${formattedTime}${ANSI.reset} ` : `${formattedTime} `;
  }

  // 2. Level Badge & Icon
  const badge =
    options.badges?.[entry.level] ||
    DEFAULT_LEVEL_BADGES[entry.level] ||
    `[${entry.level.toUpperCase()}]`;
  const icon = showIcons ? `${ICONS[entry.level] || ""} ` : "";
  const ns = entry.namespace
    ? showColors
      ? `${ANSI.blue}(${entry.namespace})${ANSI.reset} `
      : `(${entry.namespace}) `
    : "";

  // 3. Ambient Context Tags
  let contextTag = "";
  const showContext = options.context ?? true;
  if (showContext !== false && entry.context && preset !== "minimal") {
    const ctx = entry.context;
    const parts: string[] = [];

    const actorEnabled = typeof showContext === "object" ? showContext.actor !== false : true;
    const tenantEnabled = typeof showContext === "object" ? showContext.tenant !== false : true;
    const reqEnabled = typeof showContext === "object" ? showContext.requestId !== false : true;

    if (actorEnabled && ctx.actor?.id) {
      const email = ctx.actor.email ? ` <${ctx.actor.email}>` : "";
      const iconStr = showIcons ? "👤 " : "";
      parts.push(`${iconStr}${ctx.actor.id}${email}`);
    }
    if (tenantEnabled && ctx.tenant?.id) {
      const iconStr = showIcons ? "🏢 " : "";
      parts.push(`${iconStr}${ctx.tenant.slug || ctx.tenant.id}`);
    }
    if (reqEnabled && ctx.requestId) {
      const iconStr = showIcons ? "🆔 " : "";
      parts.push(`${iconStr}${ctx.requestId.slice(0, 8)}`);
    }

    if (parts.length > 0) {
      contextTag = showColors
        ? ` ${ANSI.dim}[${parts.join(" | ")}]${ANSI.reset}`
        : ` [${parts.join(" | ")}]`;
    }
  }

  // 4. Message Styling (Special formatting for AI & HTTP routes)
  let message = entry.message;
  if (showColors) {
    if (message.startsWith("[AI:")) {
      message = message
        .replace("[AI:Start]", `${ANSI.magenta}🤖 [AI:START]${ANSI.reset}`)
        .replace("[AI:Success]", `${ANSI.green}🤖 [AI:SUCCESS]${ANSI.reset}`)
        .replace("[AI:Call]", `${ANSI.cyan}🤖 [AI:CALL]${ANSI.reset}`)
        .replace("[AI:Error]", `${ANSI.red}${ANSI.bold}🤖 [AI:ERROR]${ANSI.reset}`);
    } else if (
      message.includes("<-- GET") ||
      message.includes("<-- POST") ||
      message.includes("<-- PUT") ||
      message.includes("<-- DELETE")
    ) {
      // Highlight HTTP latency
      message = message.replace(
        /(\d{3})\sin\s([\d.]+ms)/,
        `${ANSI.green}$1${ANSI.reset} in ${ANSI.yellow}$2${ANSI.reset}`,
      );
    }
  }

  let out = `${timeStr}${icon}${badge} ${ns}${message}${contextTag}`;

  // 5. Metadata formatting
  if (entry.meta && Object.keys(entry.meta).length > 0 && preset !== "compact") {
    let filteredMeta = entry.meta;
    if (options.filterMeta) {
      filteredMeta = Object.fromEntries(
        Object.entries(entry.meta).filter(([k, v]) => options.filterMeta!(k, v)),
      );
    }

    if (Object.keys(filteredMeta).length > 0) {
      const maxDepth = options.depth ?? 4;
      if (showColors && (options.colorizeMeta ?? true)) {
        out += `\n${colorizeJson(filteredMeta, 2, maxDepth)}`;
      } else {
        const rawJson = JSON.stringify(filteredMeta, null, 2);
        out += `\n${rawJson}`;
      }
    }
  }

  // 6. Error & Stack Formatting
  if (entry.error) {
    const errObj =
      entry.error instanceof Error
        ? entry.error
        : (entry.error as { name?: string; message: string; stack?: string });
    const stack = errObj.stack
      ? errObj.stack
          .split("\n")
          .slice(1)
          .map((line) => {
            if (!showColors) return `  ${line}`;
            return line.includes("node_modules")
              ? `  ${ANSI.gray}${line.trim()}${ANSI.reset}`
              : `  ${ANSI.brightRed}${line.trim()}${ANSI.reset}`;
          })
          .join("\n")
      : "";
    const errTitle = showColors
      ? `${ANSI.red}${ANSI.bold}${errObj.name || "Error"}: ${errObj.message}${ANSI.reset}`
      : `${errObj.name || "Error"}: ${errObj.message}`;
    out += `\n  ${errTitle}\n${stack}`;
  }

  return out;
}

export function formatDevAudit(record: AuditRecord, options: DevDisplayOptions = {}): string {
  const showColors = options.colorize ?? true;
  const showIcons = options.icons ?? true;

  const rawTime = record.timestamp || new Date().toISOString();
  const time = showColors
    ? `${ANSI.gray}${rawTime.split("T")[1]?.replace("Z", "") || rawTime}${ANSI.reset} `
    : `${rawTime.split("T")[1]?.replace("Z", "") || rawTime} `;

  const icon = showIcons ? "🛡️  " : "";
  const badge = showColors
    ? `${ANSI.bgMagenta}${ANSI.white}${ANSI.bold} AUDIT ${ANSI.reset}`
    : "[AUDIT]";
  const action = showColors ? `${ANSI.bold}${record.action}${ANSI.reset}` : record.action;

  const outcome = (record.outcome || "SUCCESS").toUpperCase();
  let outcomeBadge = `[${outcome}]`;
  if (showColors) {
    const outcomeColor =
      record.outcome === "success"
        ? ANSI.green
        : record.outcome === "denied"
          ? ANSI.yellow
          : ANSI.red;
    outcomeBadge = `${outcomeColor}[${outcome}]${ANSI.reset}`;
  }

  const actorStr = record.actor?.id
    ? showColors
      ? `${ANSI.cyan}${record.actor.email || record.actor.id}${ANSI.reset}`
      : record.actor.email || record.actor.id
    : "system";
  const resourceStr = `${record.resource.type}:${showColors ? `${ANSI.bold}${record.resource.id}${ANSI.reset}` : record.resource.id}`;

  let out = `${time}${icon}${badge} ${outcomeBadge} ${actorStr} ➔ ${action} on ${resourceStr}`;

  if (record.changes) {
    const changesStr = showColors
      ? colorizeJson(record.changes, 2, 3)
      : JSON.stringify(record.changes);
    out += `\n  ${showColors ? `${ANSI.dim}Changes:${ANSI.reset}` : "Changes:"} ${changesStr}`;
  }
  if (record.details) {
    const detailsStr = showColors
      ? colorizeJson(record.details, 2, 3)
      : JSON.stringify(record.details);
    out += `\n  ${showColors ? `${ANSI.dim}Details:${ANSI.reset}` : "Details:"} ${detailsStr}`;
  }

  return out;
}
