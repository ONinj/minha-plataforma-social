import Anthropic from "@anthropic-ai/sdk";
import {
  MODO_NUVEM,
  chaveAnthropic,
  comSaldo,
  contexto,
  debitar,
  exigirRecurso,
  exigirSaldo,
  responderErro,
  usdParaCreditos,
  type Contexto,
} from "@/lib/servidor/contexto";

export const runtime = "nodejs";
export const maxDuration = 300;

type Corpo = {
  model: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  system?: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: Anthropic.Beta.BetaTool[];
  maxTokens?: number;
  /** Para o extrato: o que foi feito (ex.: "Gerente", "Descrição da biblioteca"). */
  uso?: string;
};

const ORDEM_ESFORCO = ["low", "medium", "high", "xhigh", "max"];

export async function POST(req: Request) {
  let ctx: Contexto | null = null;
  try {
    const corpo = (await req.json()) as Corpo;
    if (MODO_NUVEM) {
      ctx = await contexto(req);
      exigirRecurso(ctx.recursos.claude.includes(corpo.model), `O modelo ${corpo.model} não está no seu plano.`);
      if (corpo.effort && ORDEM_ESFORCO.indexOf(corpo.effort) > ORDEM_ESFORCO.indexOf(ctx.recursos.esforco_max)) {
        corpo.effort = ctx.recursos.esforco_max;
      }
      exigirSaldo(ctx, 1);
    }
    const apiKey = chaveAnthropic(req);
    if (!apiKey) return Response.json({ error: "Chave da Anthropic não configurada." }, { status: 400 });

    const client = new Anthropic({ apiKey });
    const resposta = await client.beta.messages.create({
      model: corpo.model,
      max_tokens: corpo.maxTokens ?? 16000,
      system: corpo.system
        ? [{ type: "text", text: corpo.system, cache_control: { type: "ephemeral" } }]
        : undefined,
      messages: corpo.messages,
      tools: corpo.tools && corpo.tools.length > 0 ? corpo.tools : undefined,
      output_config: corpo.effort ? { effort: corpo.effort } : undefined,
      // Se algum trecho antigo da conversa não bater com o raciocínio salvo, a API
      // descarta esse raciocínio e segue, em vez de travar a conversa com erro 400.
      thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
      // Se o modelo recusar por política, a API tenta outro modelo automaticamente.
      betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
      fallbacks: "default",
      // Cache automático do histórico: deixa as conversas longas bem mais baratas.
      cache_control: { type: "ephemeral" },
    });

    if (ctx) {
      // Cobra pelo uso real de tokens do modelo que respondeu.
      const [entrada, saida] = ctx.precos.claude[resposta.model] ?? ctx.precos.claude[corpo.model] ?? [4, 20];
      const u = resposta.usage;
      const tokensEntrada =
        (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
      const usd = (tokensEntrada * entrada + (u.output_tokens ?? 0) * saida) / 1_000_000;
      await debitar(ctx, usdParaCreditos(ctx, usd), `${corpo.uso ?? "Claude"} · ${resposta.model}`, {
        custoUsd: usd,
        permitirNegativo: true,
      });
    }
    return comSaldo(Response.json(resposta), ctx);
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
    return responderErro(erro);
  }
}
