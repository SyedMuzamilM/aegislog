import express from 'express';
import { aegisExpressMiddleware, audit, context, logger } from '@aegislog/express';

const app = express();
app.use(express.json());

// AegisLog Request Middleware: automatically tracks IP, RequestId, Actor, and Response latency
app.use(
  aegisExpressMiddleware({
    getActor: (req) => {
      const auth = req.headers.authorization;
      if (auth) {
        return { id: 'usr_sarah', email: 'sarah@acme.com', role: 'admin' };
      }
      return undefined;
    },
    getTenant: (req) => {
      const tenantId = req.headers['x-tenant-id'] as string;
      return tenantId ? { id: tenantId, slug: 'acme-corp' } : undefined;
    },
  })
);

// Simulated database operation
async function chargeCustomerCard(amount: number) {
  // 0 parameter drilling needed: Sarah's context is automatically present in the log!
  logger.info('Processing payment via Stripe gateway', { amount });
  return { transactionId: 'txn_stripe_992' };
}

// 1. Checkout Endpoint with Context & Audit Trail
app.post('/api/checkout', async (req, res) => {
  const { amount, creditCard, password } = req.body;

  // The "Helmet" shield automatically redacts creditCard and password!
  logger.info('Checkout request received', {
    amount,
    creditCard, // Masked automatically!
    password, // Masked automatically!
  });

  const payment = await chargeCustomerCard(amount);

  // Business Audit Trail
  await audit.record({
    action: 'billing.payment_processed',
    resource: { type: 'invoice', id: 'inv_2026_01' },
    details: { amount, transactionId: payment.transactionId },
    outcome: 'success',
  });

  res.json({ success: true, payment });
});

// 2. Late Authentication Endpoint Example
app.post('/api/login', (req, res) => {
  logger.info('Login requested'); // No user known yet

  // Late binding user into context
  context.setActor({ id: 'usr_new_login', email: req.body.email });
  context.setTenant({ id: 'org_main' });

  logger.info('Login successful'); // Sarah or new user attached now!
  res.json({ token: 'mock-jwt-token' });
});

const PORT = 3000;
app.listen(PORT, () => {
  logger.info(`🚀 Express Server running on http://localhost:${PORT}`);
});
