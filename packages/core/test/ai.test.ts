import { describe, expect, it } from "vitest";
import { MemorySink } from "../src/sinks.js";
import { createLogger } from "../src/logger.js";

describe("AegisLog AI Tracker", () => {
  it("tracks successful LLM calls and calculates token cost", async () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    const mockAiResponse = {
      id: "chatcmpl_123",
      choices: [{ message: { role: "assistant", content: "Here is the summary." } }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_tokens: 1200,
      },
    };

    const result = await logger.ai.track({
      model: "gpt-4o",
      provider: "openai",
      messages: [{ role: "user", content: "Please summarize customer feedback." }],
      call: async () => mockAiResponse,
    });

    expect(result.id).toBe("chatcmpl_123");

    const successLog = memory.entries.find((e) => e.message.includes("[AI:Success] openai:gpt-4o"));
    expect(successLog).toBeDefined();
    expect(successLog?.level).toBe("info");

    const meta = successLog?.meta as Record<string, unknown>;
    const usage = meta?.usage as Record<string, unknown>;
    expect(usage?.promptTokens).toBe(1000);
    expect(usage?.completionTokens).toBe(200);
    expect(usage?.totalTokens).toBe(1200);
    expect(usage?.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("redacts sensitive PII in AI prompts and messages", async () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory], level: "debug" });

    await logger.ai.track({
      model: "claude-3-5-sonnet",
      provider: "anthropic",
      messages: [
        {
          role: "user",
          content:
            "My credit card is 4111 2222 3333 4444 and my auth key is sk-1234567890abcdef1234567890abcdef",
        },
      ],
      call: async () => ({ text: "OK" }),
    });

    const startLog = memory.entries.find((e) =>
      e.message.includes("[AI:Start] anthropic:claude-3-5-sonnet"),
    );
    expect(startLog).toBeDefined();

    const meta = startLog?.meta as Record<string, unknown>;
    const messages = meta?.messages as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("****-****-****-4444");
    expect(messages[0]?.content).toContain("sk-[REDACTED_KEY]");
  });

  it("captures errors and logs them with latency", async () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    await expect(
      logger.ai.track({
        model: "gpt-4o",
        provider: "openai",
        call: async () => {
          throw new Error("Rate limit exceeded (429)");
        },
      }),
    ).rejects.toThrow("Rate limit exceeded (429)");

    const errorLog = memory.entries.find((e) =>
      e.message.includes("[AI:Error] openai:gpt-4o failed"),
    );
    expect(errorLog).toBeDefined();
    expect(errorLog?.level).toBe("error");
    expect(errorLog?.meta?.durationMs).toBeDefined();
  });

  it("supports direct ai.log call for explicit event recording", () => {
    const memory = new MemorySink();
    const logger = createLogger({ sinks: [memory] });

    logger.ai.log({
      model: "deepseek-r1",
      provider: "deepseek",
      prompt: "Reason about distributed consensus",
      completion: "Raft consensus achieves agreement via leader election...",
      usage: { promptTokens: 300, completionTokens: 150 },
      durationMs: 420,
    });

    const callLog = memory.entries.find((e) =>
      e.message.includes("[AI:Call] deepseek:deepseek-r1"),
    );
    expect(callLog).toBeDefined();
    expect(callLog?.level).toBe("info");
    const meta = callLog?.meta as Record<string, unknown>;
    const usage = meta?.usage as Record<string, unknown>;
    expect(usage?.promptTokens).toBe(300);
    expect(usage?.completionTokens).toBe(150);
    expect(usage?.totalTokens).toBe(450);
    expect(usage?.estimatedCostUsd).toBeGreaterThan(0);
  });
});
