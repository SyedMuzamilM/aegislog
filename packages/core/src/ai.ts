import type { AegisLogger } from './logger.js';
import type { SecurityShield } from './shield.js';

export interface AiPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

// Pricing table (USD per 1M tokens)
const MODEL_PRICING: Record<string, AiPricing> = {
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4-turbo': { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  'claude-3-5-sonnet': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-3-5-haiku': { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  'claude-3-opus': { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'deepseek-chat': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  'deepseek-r1': { inputPerMillion: 0.55, outputPerMillion: 2.19 },
};

export interface AiMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface AiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

export interface AiTrackOptions<T> {
  model: string;
  provider?: string;
  messages?: AiMessage[];
  prompt?: string;
  meta?: Record<string, unknown>;
  pricing?: AiPricing;
  call: () => Promise<T>;
}

export interface AiTrackResult<T> {
  result: T;
  usage?: AiUsage;
  durationMs: number;
  model: string;
  provider: string;
}

export class AiTracker {
  private logger: AegisLogger;
  private shield: SecurityShield;

  constructor(logger: AegisLogger, shield: SecurityShield) {
    this.logger = logger;
    this.shield = shield;
  }

  public calculateCost(model: string, promptTokens = 0, completionTokens = 0, customPricing?: AiPricing): number {
    const pricing = customPricing ?? MODEL_PRICING[model.toLowerCase()] ?? { inputPerMillion: 0, outputPerMillion: 0 };
    const inputCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;
    return Number((inputCost + outputCost).toFixed(6));
  }

  public async track<T>(options: AiTrackOptions<T>): Promise<T> {
    const provider = options.provider ?? 'ai';
    const model = options.model;
    const start = performance.now();

    const sanitizedMessages = options.messages ? this.shield.sanitize(options.messages) : undefined;
    const sanitizedPrompt = options.prompt ? this.shield.sanitizeString(options.prompt) : undefined;

    this.logger.debug(`[AI:Start] ${provider}:${model}`, {
      provider,
      model,
      prompt: sanitizedPrompt,
      messages: sanitizedMessages,
      meta: options.meta,
    });

    try {
      const result = await options.call();
      const durationMs = Number((performance.now() - start).toFixed(2));

      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;

      // Extract usage from common SDK shapes (OpenAI, Anthropic, Gemini)
      if (result && typeof result === 'object') {
        const anyRes = result as Record<string, unknown>;
        const usage = (anyRes.usage || anyRes.usageMetadata) as Record<string, unknown> | undefined;

        if (usage) {
          promptTokens = Number(usage.prompt_tokens ?? usage.promptTokenCount ?? usage.input_tokens ?? 0);
          completionTokens = Number(usage.completion_tokens ?? usage.candidatesTokenCount ?? usage.output_tokens ?? 0);
          totalTokens = Number(usage.total_tokens ?? usage.totalTokenCount ?? (promptTokens + completionTokens));
        }
      }

      const cost = this.calculateCost(model, promptTokens, completionTokens, options.pricing);
      const usageInfo: AiUsage = {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: cost,
      };

      this.logger.info(`[AI:Success] ${provider}:${model} (${totalTokens} tokens, ~$${cost}, ${durationMs}ms)`, {
        provider,
        model,
        durationMs,
        usage: usageInfo,
        meta: options.meta,
      });

      return result;
    } catch (error) {
      const durationMs = Number((performance.now() - start).toFixed(2));
      this.logger.error(`[AI:Error] ${provider}:${model} failed in ${durationMs}ms`, {
        provider,
        model,
        durationMs,
        error: error instanceof Error ? error : new Error(String(error)),
        prompt: sanitizedPrompt,
        messages: sanitizedMessages,
        meta: options.meta,
      });
      throw error;
    }
  }
}
