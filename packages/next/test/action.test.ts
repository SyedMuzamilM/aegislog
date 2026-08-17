import { describe, expect, it } from 'vitest';
import { MemorySink, createLogger } from 'aegislog';
import { withAegisContext } from '../src/action.js';

describe('AegisLog Next.js Server Action Adapter', () => {
  it('wraps server actions in ambient context and logs duration', async () => {
    const memory = new MemorySink();
    const testLogger = createLogger({ sinks: [memory] });

    const result = await withAegisContext(
      {
        logger: testLogger,
        actionName: 'updateUserProfile',
        actor: { id: 'usr_next_1', email: 'next@vercel.app' },
        tenant: { id: 'org_vercel' },
      },
      async () => {
        testLogger.info('Updating bio in DB');
        return { updated: true };
      }
    );

    expect(result.updated).toBe(true);

    const bioLog = memory.entries.find((e) => e.message === 'Updating bio in DB');
    expect(bioLog).toBeDefined();
    expect(bioLog?.context?.actor?.id).toBe('usr_next_1');
    expect(bioLog?.context?.tenant?.id).toBe('org_vercel');
    expect(bioLog?.context?.tags?.action).toBe('updateUserProfile');

    const successLog = memory.entries.find((e) => e.message.includes('[ServerAction:Success] updateUserProfile'));
    expect(successLog).toBeDefined();
  });
});
