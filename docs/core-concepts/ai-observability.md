# AI & LLM Observability 🤖

Modern web and backend applications frequently interact with LLMs (OpenAI, Anthropic Claude, Google Gemini, DeepSeek). AegisLog provides built-in AI call tracing, token counting, cost tracking, and automatic prompt PII redaction.

---

## ⚡ Key Features

1. **Automatic Token Extraction:** Automatically reads token metrics from standard SDK response shapes (OpenAI `usage.prompt_tokens`, Anthropic `usage.input_tokens`, Gemini `usageMetadata.promptTokenCount`).
2. **Dynamic USD Cost Calculation:** Built-in pricing tables for GPT-4o, GPT-4o Mini, Claude 3.5 Sonnet, Claude 3.5 Haiku, Gemini 2.0 Flash, DeepSeek R1, and DeepSeek Chat.
3. **Prompt PII & Credential Sanitization:** Scans and scrubs passwords, credit cards, and API keys from prompts and messages before logging.
4. **Latency Measurement:** Measures millisecond inference duration.

---

## 🛠️ Usage Patterns

### 1. Wrapping an LLM Call with `ai.track()`

```typescript
import { ai } from "aegislog";
import OpenAI from "openai";

const openai = new OpenAI();

const response = await ai.track({
  model: "gpt-4o",
  provider: "openai",
  prompt: "Summarize this customer support ticket",
  call: async () => {
    return await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a helpful customer support AI." },
        { role: "user", content: "Customer cannot reset their password for account usr_123." },
      ],
    });
  },
});

// Automatically logged in terminal:
// 16:10:04.112 ℹ️ [INFO] 🤖 [AI:SUCCESS] openai:gpt-4o (480 tokens, ~$0.001200, 342ms)
```

### 2. Direct Event Recording with `ai.log()`

If you already have token usage data (e.g. from a streaming response or background worker), use `ai.log()`:

```typescript
import { ai } from "aegislog";

ai.log({
  model: "claude-3-5-sonnet",
  provider: "anthropic",
  prompt: "Generate SQL query for user metrics",
  completion: "SELECT count(*) FROM users WHERE created_at > now() - interval '7 days';",
  usage: {
    promptTokens: 250,
    completionTokens: 40,
  },
  durationMs: 512,
});
```

---

## 💵 Supported Models & Default Pricing

| Model Name          | Input Price (per 1M tokens) | Output Price (per 1M tokens) |
| :------------------ | :-------------------------- | :--------------------------- |
| `gpt-4o`            | $2.50                       | $10.00                       |
| `gpt-4o-mini`       | $0.15                       | $0.60                        |
| `claude-3-5-sonnet` | $3.00                       | $15.00                       |
| `claude-3-5-haiku`  | $0.80                       | $4.00                        |
| `gemini-2.0-flash`  | $0.10                       | $0.40                        |
| `gemini-1.5-pro`    | $1.25                       | $5.00                        |
| `deepseek-r1`       | $0.55                       | $2.19                        |
| `deepseek-chat`     | $0.14                       | $0.28                        |

You can also provide custom pricing via the `pricing: { inputPerMillion, outputPerMillion }` option.
