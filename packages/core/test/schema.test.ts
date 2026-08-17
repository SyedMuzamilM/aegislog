import { describe, expect, it } from 'vitest';
import { MemorySink } from '../src/sinks.js';
import { createLogger } from '../src/logger.js';
import { defineLogEvent } from '../src/schema.js';

describe('AegisLog Type-Safe Event Schemas', () => {
  it('logs validated events with simple validator function', () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    interface UserSignupData {
      userId: string;
      plan: 'free' | 'pro';
    }

    const UserSignupEvent = defineLogEvent<string, UserSignupData>({
      name: 'user.signed_up',
      schema: (data: unknown) => {
        const d = data as UserSignupData;
        if (!d.userId || !d.plan) throw new Error('Invalid signup payload');
        return d;
      },
    });

    logger.event(UserSignupEvent, {
      userId: 'usr_100',
      plan: 'pro',
    });

    expect(memory.entries.length).toBe(1);
    expect(memory.entries[0]?.message).toBe('[Event: user.signed_up]');
    const meta = memory.entries[0]?.meta as Record<string, unknown>;
    expect(meta?.event).toBe('user.signed_up');
    const payload = meta?.payload as UserSignupData;
    expect(payload?.userId).toBe('usr_100');
    expect(payload?.plan).toBe('pro');
  });

  it('supports Standard Schema v1 objects', () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    const OrderPlacedEvent = defineLogEvent({
      name: 'order.placed',
      schema: {
        '~standard': {
          version: 1 as const,
          vendor: 'test-validator',
          validate: (val: unknown) => {
            const v = val as { orderId?: string };
            if (!v?.orderId) {
              return { issues: [{ message: 'orderId is required' }] };
            }
            return { value: v };
          },
        },
      },
    });

    logger.event(OrderPlacedEvent, { orderId: 'ord_77' });
    expect(memory.entries.length).toBe(1);

    expect(() => {
      // @ts-expect-error test invalid payload
      logger.event(OrderPlacedEvent, {});
    }).toThrow('orderId is required');
  });
});
