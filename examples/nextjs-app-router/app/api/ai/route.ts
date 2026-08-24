import { type NextRequest, NextResponse } from "next/server";
import { ai } from "aegislog";

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) {
    return NextResponse.json({ error: "prompt must be a non-empty string" }, { status: 400 });
  }
  if (input.model !== undefined && typeof input.model !== "string") {
    return NextResponse.json({ error: "model must be a string" }, { status: 400 });
  }

  const prompt = input.prompt;
  const model = input.model ?? "gpt-4o";

  const result = await ai.track({
    model,
    provider: "openai",
    prompt,
    meta: { endpoint: "/api/ai" },
    call: async () => {
      // Simulate external AI call
      return {
        id: "chatcmpl_nextjs_99",
        output: `Generated intelligent summary for: ${prompt}`,
        usage: {
          prompt_tokens: 350,
          completion_tokens: 65,
          total_tokens: 415,
        },
      };
    },
  });

  return NextResponse.json(result);
}
