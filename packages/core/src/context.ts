import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActorContext, AegisContext, SessionContext, TenantContext } from './types.js';

export const contextStorage: AsyncLocalStorage<AegisContext> = new AsyncLocalStorage<AegisContext>();

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function runWithContext<T>(
  ctx: Partial<AegisContext> & { requestId?: string },
  fn: () => T
): T {
  const fullContext: AegisContext = {
    requestId: ctx.requestId ?? generateId(),
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    actor: ctx.actor ? { ...ctx.actor } : undefined,
    tenant: ctx.tenant ? { ...ctx.tenant } : undefined,
    session: ctx.session ? { ...ctx.session } : undefined,
    tags: ctx.tags ? { ...ctx.tags } : {},
    data: ctx.data ? { ...ctx.data } : {},
  };

  return contextStorage.run(fullContext, fn);
}

export function getContext(): AegisContext | undefined {
  return contextStorage.getStore();
}

export function setActor(actor: ActorContext): void {
  const store = contextStorage.getStore();
  if (store) {
    store.actor = { ...store.actor, ...actor };
  }
}

export function setTenant(tenant: TenantContext): void {
  const store = contextStorage.getStore();
  if (store) {
    store.tenant = { ...store.tenant, ...tenant };
  }
}

export function setSession(session: SessionContext): void {
  const store = contextStorage.getStore();
  if (store) {
    store.session = { ...store.session, ...session };
  }
}

export function setTag(key: string, value: string): void {
  const store = contextStorage.getStore();
  if (store) {
    if (!store.tags) {
      store.tags = {};
    }
    store.tags[key] = value;
  }
}

export function setData(key: string, value: unknown): void {
  const store = contextStorage.getStore();
  if (store) {
    if (!store.data) {
      store.data = {};
    }
    store.data[key] = value;
  }
}

export interface ContextManager {
  run: typeof runWithContext;
  get: typeof getContext;
  setActor: typeof setActor;
  setTenant: typeof setTenant;
  setSession: typeof setSession;
  setTag: typeof setTag;
  setData: typeof setData;
  generateId: typeof generateId;
}

export const context: ContextManager = {
  run: runWithContext,
  get: getContext,
  setActor: setActor,
  setTenant: setTenant,
  setSession: setSession,
  setTag: setTag,
  setData: setData,
  generateId: generateId,
};

