import {
  type ActorContext,
  type TenantContext,
  logger as defaultLogger,
  runWithContext,
  type AegisLogger,
} from "aegislog";

export interface NextActionContextOptions {
  logger?: AegisLogger;
  actor?: ActorContext;
  tenant?: TenantContext;
  requestId?: string;
  tags?: Record<string, string>;
  actionName?: string;
}

export async function withAegisContext<T>(
  options: NextActionContextOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const log = options.logger ?? defaultLogger;
  const requestId =
    options.requestId ?? `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const tags = {
    ...options.tags,
    ...(options.actionName ? { action: options.actionName } : {}),
  };

  return runWithContext(
    {
      requestId,
      actor: options.actor,
      tenant: options.tenant,
      tags,
    },
    async () => {
      const start = performance.now();
      if (options.actionName) {
        log.debug(`[ServerAction:Start] ${options.actionName}`);
      }

      try {
        const result = await fn();
        if (options.actionName) {
          const duration = Number((performance.now() - start).toFixed(2));
          log.info(`[ServerAction:Success] ${options.actionName} in ${duration}ms`, {
            durationMs: duration,
          });
        }
        return result;
      } catch (error) {
        if (options.actionName) {
          const duration = Number((performance.now() - start).toFixed(2));
          log.error(`[ServerAction:Error] ${options.actionName} failed in ${duration}ms`, {
            durationMs: duration,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
        throw error;
      }
    },
  );
}

export function createActionLogger(
  actionOrOptions: string | { actionName: string; actor?: ActorContext; logger?: AegisLogger },
): AegisLogger {
  const actionName =
    typeof actionOrOptions === "string" ? actionOrOptions : actionOrOptions.actionName;
  const baseLogger =
    typeof actionOrOptions === "object" && actionOrOptions.logger
      ? actionOrOptions.logger
      : defaultLogger;
  const defaultMeta =
    typeof actionOrOptions === "object" && actionOrOptions.actor
      ? { actor: actionOrOptions.actor }
      : undefined;
  return baseLogger.child({ namespace: `action:${actionName}`, defaultMeta });
}
