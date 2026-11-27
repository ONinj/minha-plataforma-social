import Anthropic from "@anthropic-ai/sdk";
import {
  MODO_NUVEM,
  acertar,
  chaveAnthropic,
  comSaldo,
  contexto,
  exigirRecurso,
  reservar,
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
const MAX_TOKENS = 16000; // acima disso a biblioteca da Anthropic exige streaming

/**
 * Estimativa pessimista do custo (sem contar o desconto do cache), usada para reservar créditos antes da chamada.
 * Texto ~3,5 caracteres por token; imagem ~1.600 tokens; PDF ~1 token a cada 3 bytes (no máximo 200 mil).
 */
function tokensDeEntrada(corpo: Corpo): number {
  let tokens = (corpo.system?.length ?? 0) / 3.5 + JSON.stringify(corpo.tools ?? []).length / 3.5;
  const visitar = (v: unknown): void => {
    if (typeof v === "string") tokens += v.length / 3.5;
    else if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "image") tokens += 1600;
      else if (o.type === "document") {
        const dados = (o.source as { data?: string } | undefined)?.data ?? "";
        tokens += Math.min(200_000, (dados.length * 0.75) / 3);
      } else Object.entries(o).forEach(([k, x]) => k !== "signature" && visitar(x));
    }
  };
  visitar(corpo.messages);
  return Math.ceil(tokens);
}

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
    }
    const apiKey = chaveAnthropic(req);
    if (!apiKey) return Response.json({ error: "Chave da Anthropic não configurada." }, { status: 400 });
    const maxTokens = Math.min(MAX_TOKENS, Math.max(256, Math.round(Number(corpo.maxTokens) || 16000)));
    let reserva: { ref: string; reservado: number } | null = null;
    if (ctx) {
      // Reserva o custo máximo provável ANTES de chamar (ou o saldo que houver, com no mínimo 1 crédito).
      const [entrada, saida] = ctx.precos.claude[corpo.model] ?? [4, 20];
      const usdMax = (tokensDeEntrada(corpo) * entrada + maxTokens * saida) / 1_000_000;
      reserva = await reservar(ctx, { max: usdParaCreditos(ctx, usdMax), minimo: 1, descricao: `${corpo.uso ?? "Claude"} · em andamento` });
    }
    const client = new Anthropic({ apiKey });
    let resposta: Anthropic.Beta.BetaMessage;
    try {
      resposta = await client.beta.messages.create({
      model: corpo.model,
      max_tokens: maxTokens,
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
    } catch (erro) {
      if (ctx && reserva) await acertar(ctx, reserva.ref, 0).catch(() => {});
      throw erro;
    }

    if (ctx && reserva) {
      // Acerta pelo uso real de tokens do modelo que respondeu.
      const [entrada, saida] = ctx.precos.claude[resposta.model] ?? ctx.precos.claude[corpo.model] ?? [4, 20];
      const u = resposta.usage;
      const tokensEntrada =
        (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
      const usd = (tokensEntrada * entrada + (u.output_tokens ?? 0) * saida) / 1_000_000;
      await acertar(ctx, reserva.ref, usdParaCreditos(ctx, usd), { custoUsd: usd, descricao: `${corpo.uso ?? "Claude"} · ${resposta.model}` });
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
