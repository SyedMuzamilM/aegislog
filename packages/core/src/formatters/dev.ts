import type { AuditRecord, DevDisplayOptions, LogEntry, LogLevel } from "../types.js";

// ANSI color escape codes with 256-color & truecolor modern styling
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
  // Background badges
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
  bgBlack: "\x1b[40m",
  bgBrightBlack: "\x1b[100m",
};

// Sleek level badges
const LEVEL_BADGES: Record<LogLevel, { text: string; colored: string }> = {
  trace: {
    text: " TRC ",
    colored: `${ANSI.gray}[TRACE]${ANSI.reset}`,
  },
  debug: {
    text: " DBG ",
    colored: `${ANSI.magenta}${ANSI.bold} DEBUG ${ANSI.reset}`,
  },
  info: {
    text: " INF ",
    colored: `${ANSI.cyan}${ANSI.bold}  INFO ${ANSI.reset}`,
  },
  warn: {
    text: " WRN ",
    colored: `${ANSI.bgYellow}${ANSI.black}${ANSI.bold}  WARN ${ANSI.reset}`,
  },
  error: {
    text: " ERR ",
    colored: `${ANSI.bgRed}${ANSI.brightWhite}${ANSI.bold} ERROR ${ANSI.reset}`,
  },
  fatal: {
    text: " FTL ",
    colored: `${ANSI.bgRed}${ANSI.brightWhite}${ANSI.bold} FATAL ${ANSI.reset}`,
  },
};

/**
 * Format a value for terminal metadata tree
 */
function formatValue(val: unknown, showColors: boolean, depth = 0): string {
  if (depth > 3) return showColors ? `${ANSI.gray}[Object]${ANSI.reset}` : "[Object]";
  if (val === null) return showColors ? `${ANSI.gray}null${ANSI.reset}` : "null";
  if (val === undefined) return showColors ? `${ANSI.gray}undefined${ANSI.reset}` : "undefined";

  const type = typeof val;
  if (type === "string") {
    return showColors ? `${ANSI.green}"${val}"${ANSI.reset}` : `"${val}"`;
  }
  if (type === "number") {
    return showColors ? `${ANSI.brightYellow}${val}${ANSI.reset}` : String(val);
  }
  if (type === "boolean") {
    return showColors ? `${ANSI.brightMagenta}${val}${ANSI.reset}` : String(val);
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    const formattedItems = val.map((v) => formatValue(v, showColors, depth + 1)).join(", ");
    return `[ ${formattedItems} ]`;
  }

  if (type === "object") {
    const keys = Object.keys(val as object);
    if (keys.length === 0) return "{}";
    const pairs = keys
      .map((k) => {
        const kStr = showColors ? `${ANSI.cyan}${k}${ANSI.reset}` : k;
        const vStr = formatValue((val as Record<string, unknown>)[k], showColors, depth + 1);
        return `${kStr}: ${vStr}`;
      })
      .join(", ");
    return `{ ${pairs} }`;
  }

  return String(val);
}

/**
 * Renders structured metadata as a clean vertical tree
 */
export function formatTreeMetadata(
  meta: Record<string, unknown>,
  showColors = true,
  prefix = "          ",
): string {
  const keys = Object.keys(meta);
  if (keys.length === 0) return "";

  const treePipe = showColors ? `${ANSI.gray}│${ANSI.reset} ` : "│ ";
  const lines: string[] = [];

  for (const key of keys) {
    const value = meta[key];
    const keyStyled = showColors ? `${ANSI.cyan}${key}${ANSI.reset}:` : `${key}:`;

    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0 &&
      Object.keys(value).length <= 6
    ) {
      // Sub-object expanded
      lines.push(`${prefix}${treePipe}${keyStyled}`);
      for (const [subK, subV] of Object.entries(value as Record<string, unknown>)) {
        const subKStyled = showColors ? `${ANSI.blue}${subK}${ANSI.reset}:` : `${subK}:`;
        const valStyled = formatValue(subV, showColors, 1);
        lines.push(`${prefix}${treePipe}  ${subKStyled} ${valStyled}`);
      }
    } else {
      const valStyled = formatValue(value, showColors, 0);
      lines.push(`${prefix}${treePipe}${keyStyled} ${valStyled}`);
    }
  }

  return `\n${lines.join("\n")}`;
}

export function formatDevLog(entry: LogEntry, options: DevDisplayOptions = {}): string {
  const showColors = options.colorize ?? true;
  const preset = options.preset ?? "default";

  // 1. Timestamp (HH:MM:SS format in soft dim gray)
  let timeStr = "";
  if (options.timestamp !== false && preset !== "minimal") {
    const rawTime = entry.timestamp || new Date().toISOString();
    const formatted =
      options.timestamp === "iso"
        ? rawTime
        : rawTime.split("T")[1]?.slice(0, 8) || rawTime.slice(0, 8);
    timeStr = showColors ? `${ANSI.gray}${formatted}${ANSI.reset} ` : `${formatted} `;
  }

  // 2. Level Badge
  let badge = "";
  if (options.badges?.[entry.level]) {
    badge = options.badges[entry.level]!;
  } else {
    badge = showColors
      ? LEVEL_BADGES[entry.level]?.colored || `[${entry.level.toUpperCase()}]`
      : `[${entry.level.toUpperCase()}]`;
  }

  // 3. Namespace
  const ns = entry.namespace
    ? showColors
      ? ` ${ANSI.blue}${ANSI.bold}${entry.namespace}${ANSI.reset} ›`
      : ` ${entry.namespace} ›`
    : "";

  // 4. Ambient Context Pill: [usr_sarah @ acme-corp #req_123]
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
      const userStr = showColors
        ? `${ANSI.brightCyan}👤 ${ctx.actor.id}${email}${ANSI.reset}`
        : `👤 ${ctx.actor.id}${email}`;
      parts.push(userStr);
    }
    if (tenantEnabled && ctx.tenant?.id) {
      const tenantStr = showColors
        ? `${ANSI.brightBlue}🏢 ${ctx.tenant.slug || ctx.tenant.id}${ANSI.reset}`
        : `🏢 ${ctx.tenant.slug || ctx.tenant.id}`;
      parts.push(tenantStr);
    }
    if (reqEnabled && ctx.requestId) {
      const reqStr = showColors
        ? `${ANSI.gray}#${ctx.requestId.slice(0, 8)}${ANSI.reset}`
        : `#${ctx.requestId.slice(0, 8)}`;
      parts.push(reqStr);
    }

    if (parts.length > 0) {
      const openBracket = showColors ? `${ANSI.gray}❲ ` : "❲ ";
      const closeBracket = showColors ? `${ANSI.gray} ❳${ANSI.reset}` : " ❳";
      const separator = showColors ? `${ANSI.gray} • ${ANSI.reset}` : " • ";
      contextTag = ` ${openBracket}${parts.join(separator)}${closeBracket}`;
    }
  }

  // 5. Message Formatting with Route & AI Highlighting
  let message = entry.message;
  if (showColors) {
    if (message.startsWith("[AI:")) {
      message = message
        .replace("[AI:Start]", `${ANSI.magenta}🤖 [AI:START]${ANSI.reset}`)
        .replace("[AI:Success]", `${ANSI.green}🤖 [AI:SUCCESS]${ANSI.reset}`)
        .replace("[AI:Call]", `${ANSI.cyan}🤖 [AI:CALL]${ANSI.reset}`)
        .replace("[AI:Error]", `${ANSI.red}${ANSI.bold}🤖 [AI:ERROR]${ANSI.reset}`);
    } else if (message.includes("-->") || message.includes("<--")) {
      // Sleek HTTP route latency highlighting
      message = message
        .replace("<-- GET", `${ANSI.green}${ANSI.bold}GET${ANSI.reset}`)
        .replace("<-- POST", `${ANSI.brightBlue}${ANSI.bold}POST${ANSI.reset}`)
        .replace("<-- PUT", `${ANSI.yellow}${ANSI.bold}PUT${ANSI.reset}`)
        .replace("<-- DELETE", `${ANSI.red}${ANSI.bold}DELETE${ANSI.reset}`)
        .replace(/(\b2\d\d\b)/, `${ANSI.green}${ANSI.bold}$1 OK${ANSI.reset}`)
        .replace(/(\b4\d\d\b)/, `${ANSI.yellow}${ANSI.bold}$1${ANSI.reset}`)
        .replace(/(\b5\d\d\b)/, `${ANSI.red}${ANSI.bold}$1 ERROR${ANSI.reset}`)
        .replace(
          /in\s([\d.]+ms)/,
          `${ANSI.gray}⚡${ANSI.reset} ${ANSI.brightYellow}$1${ANSI.reset}`,
        );
    }
  }

  let out = `${timeStr}${badge}${ns} ${message}${contextTag}`;

  // 6. Metadata formatting (Tree layout)
  if (entry.meta && Object.keys(entry.meta).length > 0 && preset !== "compact") {
    let filteredMeta = entry.meta;
    if (options.filterMeta) {
      filteredMeta = Object.fromEntries(
        Object.entries(entry.meta).filter(([k, v]) => options.filterMeta!(k, v)),
      );
    }

    if (Object.keys(filteredMeta).length > 0) {
      out += formatTreeMetadata(filteredMeta, showColors, "        ");
    }
  }

  // 7. Error Stack Trace Box
  if (entry.error) {
    const errObj =
      entry.error instanceof Error
        ? entry.error
        : (entry.error as { name?: string; message: string; stack?: string });

    const errName = errObj.name || "Error";
    const errTitle = showColors
      ? `${ANSI.red}${ANSI.bold}┌─ 🚨 ${errName}: ${errObj.message}${ANSI.reset}`
      : `┌─ 🚨 ${errName}: ${errObj.message}`;

    const stackLines = errObj.stack
      ? errObj.stack
          .split("\n")
          .slice(1)
          .map((line) => {
            const trimmed = line.trim();
            if (!showColors) return `│    ${trimmed}`;
            return trimmed.includes("node_modules")
              ? `${ANSI.gray}│    ${trimmed}${ANSI.reset}`
              : `${ANSI.red}│    ${ANSI.brightWhite}${trimmed}${ANSI.reset}`;
          })
          .join("\n")
      : "";

    const bottomLine = showColors
      ? `${ANSI.red}└───────────────────────────────${ANSI.reset}`
      : "└───────────────────────────────";
    out += `\n        ${errTitle}\n        ${stackLines}\n        ${bottomLine}`;
  }

  return out;
}

export function formatDevAudit(record: AuditRecord, options: DevDisplayOptions = {}): string {
  const showColors = options.colorize ?? true;

  const rawTime = record.timestamp || new Date().toISOString();
  const time = showColors
    ? `${ANSI.gray}${rawTime.split("T")[1]?.slice(0, 8) || rawTime.slice(0, 8)}${ANSI.reset} `
    : `${rawTime.split("T")[1]?.slice(0, 8) || rawTime.slice(0, 8)} `;

  const badge = showColors
    ? `${ANSI.bgMagenta}${ANSI.brightWhite}${ANSI.bold} AUDIT ${ANSI.reset}`
    : "[AUDIT]";

  const outcome = (record.outcome || "SUCCESS").toUpperCase();
  let outcomeBadge = `[${outcome}]`;
  if (showColors) {
    const outcomeColor =
      record.outcome === "success"
        ? `${ANSI.green}${ANSI.bold}`
        : record.outcome === "denied"
          ? `${ANSI.yellow}${ANSI.bold}`
          : `${ANSI.red}${ANSI.bold}`;
    outcomeBadge = `${outcomeColor}${outcome}${ANSI.reset}`;
  }

  const actorStr = record.actor?.id
    ? showColors
      ? `${ANSI.cyan}${record.actor.email || record.actor.id}${ANSI.reset}`
      : record.actor.email || record.actor.id
    : "system";

  const actionStr = showColors
    ? `${ANSI.brightWhite}${ANSI.bold}${record.action}${ANSI.reset}`
    : record.action;

  const resourceStr = showColors
    ? `${ANSI.yellow}${record.resource.type}:${record.resource.id}${ANSI.reset}`
    : `${record.resource.type}:${record.resource.id}`;

  let out = `${time}${badge} ${outcomeBadge} ${actorStr} ➔ ${actionStr} on ${resourceStr}`;

  const metaTree: Record<string, unknown> = {};
  if (record.changes) metaTree.changes = record.changes;
  if (record.details) metaTree.details = record.details;
  if (record.reason) metaTree.reason = record.reason;

  if (Object.keys(metaTree).length > 0) {
    out += formatTreeMetadata(metaTree, showColors, "        ");
  }

  return out;
}
