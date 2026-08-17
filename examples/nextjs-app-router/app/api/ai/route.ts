import { type NextRequest, NextResponse } from "next/server";
import { ai } from "aegislog";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, model = "gpt-4o" } = body;

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
