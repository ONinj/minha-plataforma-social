import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300;

type Corpo = {
  model: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  system?: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: Anthropic.Beta.BetaTool[];
  maxTokens?: number;
};

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-anthropic-key");
  if (!apiKey) {
    return Response.json({ error: "Chave da Anthropic não configurada." }, { status: 400 });
  }

  const corpo = (await req.json()) as Corpo;
  const client = new Anthropic({ apiKey });

  try {
    const resposta = await client.beta.messages.create({
      model: corpo.model,
      max_tokens: corpo.maxTokens ?? 16000,
      system: corpo.system
        ? [{ type: "text", text: corpo.system, cache_control: { type: "ephemeral" } }]
        : undefined,
      messages: corpo.messages,
      tools: corpo.tools && corpo.tools.length > 0 ? corpo.tools : undefined,
      output_config: corpo.effort ? { effort: corpo.effort } : undefined,
      // Se o modelo recusar por política, a API tenta outro modelo automaticamente.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Cache automático do histórico: deixa as conversas longas bem mais baratas.
      cache_control: { type: "ephemeral" },
    });
    return Response.json(resposta);
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Chave da Anthropic inválida." }, { status: 401 });
    }
    if (erro instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Limite de uso atingido. Tente de novo em instantes." }, { status: 429 });
    }
    if (erro instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Erro da API do Claude (${erro.status}): ${erro.message}` },
        { status: erro.status ?? 500 },
      );
    }
    return Response.json({ error: String(erro) }, { status: 500 });
  }
}
