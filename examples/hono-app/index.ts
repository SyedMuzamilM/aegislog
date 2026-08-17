import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { aegisMiddleware, logger } from "@aegislog/hono";

const app = new Hono();

// AegisLog Hono Middleware (compatible with Cloudflare Workers, Node, and Bun)
app.use(
  "*",
  aegisMiddleware({
    getActor: (c) => {
      const auth = c.req.header("authorization");
      return auth ? { id: "usr_edge_44", email: "alex@startup.io" } : undefined;
    },
  }),
);

app.get("/api/ai/summarize", async (c) => {
  // Use built-in AI / LLM Observability & Token Cost Tracker
  const response = await logger.ai.track({
    model: "gpt-4o",
    provider: "openai",
    prompt: "Summarize customer satisfaction metrics for Q3",
    call: async () => {
      // Simulate calling OpenAI / Anthropic / Gemini
      return {
        id: "chatcmpl_999",
        reply: "Customer satisfaction score is 94% with high NPS.",
        usage: {
          prompt_tokens: 450,
          completion_tokens: 80,
          total_tokens: 530,
        },
      };
    },
  });

  return c.json(response);
});

const PORT = 3001;
logger.info(`🔥 Hono Server listening on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
