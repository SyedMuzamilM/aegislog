import { Hono } from "hono";
import { aegisMiddleware } from "@aegislog/hono";
import { OpenTelemetrySink } from "@aegislog/transports";
import { ai, audit, createLogger } from "aegislog";

// Initialize logger with OpenTelemetry Cloud Sink for Datadog / Axiom / Honeycomb
const otelSink = new OpenTelemetrySink({
  endpoint: "https://otlp.datadoghq.com/v1/logs",
  headers: { "dd-api-key": "YOUR_DATADOG_API_KEY" },
  serviceName: "cloudflare-auth-worker",
});

const edgeLogger = createLogger({
  sinks: [otelSink],
  level: "info",
});

const app = new Hono<{ Bindings: { ENVIRONMENT: string } }>();

// Edge context middleware
app.use(
  "*",
  aegisMiddleware({
    logger: edgeLogger,
    getActor: (c) => {
      const apiKey = c.req.header("x-api-key");
      return apiKey ? { id: "usr_edge_api", role: "api-client" } : undefined;
    },
    getTenant: (c) => {
      const org = c.req.header("x-organization-id");
      return org ? { id: org } : undefined;
    },
  }),
);

app.get("/api/edge-auth", async (c) => {
  edgeLogger.info("Edge authentication verified in Cloudflare data center", {
    cfRay: c.req.header("cf-ray"),
    country: c.req.header("cf-ipcountry"),
  });

  await audit.record({
    action: "edge.token_validated",
    resource: { type: "token", id: "tok_edge_001" },
    outcome: "success",
  });

  return c.json({ authenticated: true });
});

app.post("/api/edge-ai", async (c) => {
  const { prompt } = await c.req.json();

  const response = await ai.track({
    model: "claude-3-5-sonnet",
    provider: "anthropic",
    prompt,
    call: async () => {
      return {
        reply: "Edge intelligence response rendered in 18ms",
        usage: { prompt_tokens: 120, completion_tokens: 45 },
      };
    },
  });

  return c.json(response);
});

export default app;
