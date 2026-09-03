import { ai, audit, createLogger, runWithContext } from "aegislog";
import { LokiBatchSink } from "@aegislog/transports";

const LOKI_HOST = process.env.LOKI_HOST ?? "http://localhost:3100";

console.log(`📡 Connecting AegisLog to Grafana Loki at: ${LOKI_HOST}`);

const lokiSink = new LokiBatchSink({
  host: LOKI_HOST,
  labels: {
    app: "aegislog-shop",
    env: process.env.NODE_ENV ?? "development",
  },
  batchSize: 10,
  flushIntervalMs: 1500,
  onError: (err) => {
    console.error("❌ Loki ingestion error:", err.message);
  },
});

const logger = createLogger({
  namespace: "shop:api",
  sinks: [lokiSink],
  gracefulShutdown: true,
});

async function simulateTraffic() {
  console.log("🚀 Generating live logs and audit trails for Grafana & Loki...");

  // 1. Ambient Context Logging with Auto-Redaction
  await runWithContext(
    {
      requestId: `req_${Math.random().toString(36).slice(2, 8)}`,
      actor: { id: "usr_sarah", email: "sarah@acme.com", role: "admin" },
      tenant: { id: "org_acme", slug: "acme-corp" },
    },
    async () => {
      logger.info("Order checkout initiated", {
        orderId: "ord_9941",
        amount: 149.99,
        // The Helmet shield automatically redacts sensitive fields!
        creditCard: "4111 2222 3333 4444",
        password: "SecretUserPassword123!",
      });

      // 2. Business Audit Trail
      await audit.record({
        action: "billing.payment_processed",
        resource: { type: "order", id: "ord_9941" },
        outcome: "success",
        details: { amount: 149.99, gateway: "stripe" },
      });

      // 3. AI / LLM Tracking
      await ai.track({
        provider: "openai",
        model: "gpt-4o",
        prompt: "Summarize user checkout history",
        call: async () => {
          await new Promise((r) => setTimeout(r, 80));
          return { summary: "3 orders placed this month" };
        },
      });

      // 4. Warning / Error simulations
      logger.warn("Inventory low for item", { sku: "SKU_WIDGET_9", remainingStock: 2 });
    },
  );

  // 5. Unauthenticated background error simulation
  logger.error("Third-party payment webhook timed out", {
    endpoint: "https://api.stripe.com/v1/charges",
    statusCode: 504,
  });

  // Flush remaining buffers to Loki
  console.log("⏳ Flushing batch to Loki...");
  await logger.flush();
  console.log("✅ Successfully flushed logs to Loki!");

  // 6. Demonstrate historical LogQL querying directly from Node.js
  console.log("\n🔍 Querying Loki for recent error logs using lokiSink.query()...");
  try {
    const results = await lokiSink.query({
      level: "error",
      limit: 5,
    });
    console.log(`📊 Found ${results.total} matching logs in Loki:`);
    for (const item of results.items) {
      console.log(`   [${item.timestamp}] ${item.line}`);
    }
  } catch (err) {
    console.warn("⚠️ Query skipped (Loki might need a moment to index):", (err as Error).message);
  }

  console.log("\n🎉 Done! Open Grafana at http://localhost:3000 to view the AegisLog Dashboard.\n");
}

simulateTraffic().catch(console.error);
