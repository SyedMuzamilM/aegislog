import { bench, describe } from 'vitest';
import { createLogger, runWithContext, MemorySink, SecurityShield } from 'aegislog';

describe('AegisLog Microbenchmarks & Latency Profiling', () => {
  const memory = new MemorySink();
  const logger = createLogger({
    level: 'info',
    sinks: [memory],
  });

  const shield = new SecurityShield();

  bench('1. Standard Logger Info Call', () => {
    logger.info('User completed order checkout', { orderId: 'ord_12345', amount: 99.5 });
  });

  bench('2. Ambient Context Logging (AsyncLocalStorage)', () => {
    runWithContext(
      {
        requestId: 'req_bench_99',
        actor: { id: 'usr_bench', email: 'bench@user.com' },
        tenant: { id: 'org_bench' },
      },
      () => {
        logger.info('Processing order in context', { items: 3 });
      }
    );
  });

  bench('3. Security Shield Redaction (Complex Nested Object)', () => {
    shield.sanitize({
      auth: {
        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.bench',
        password: 'SuperSecretPassword',
        apiKey: 'sk-1234567890abcdef1234567890abcdef',
        creditCard: '4111 2222 3333 4444',
      },
      user: {
        id: 'usr_1',
        email: 'test@example.com',
      },
      tags: ['production', 'billing'],
    });
  });

  bench('4. Audit Trail Event Recording', async () => {
    await logger.audit.record({
      action: 'team.member_invited',
      resource: { type: 'organization', id: 'org_bench' },
      target: { type: 'user', id: 'usr_new' },
      outcome: 'success',
    });
  });
});
