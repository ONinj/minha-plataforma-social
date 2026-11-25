import { createFalClient } from "@fal-ai/client";
import { conferirCaminho, linkDeLeitura, apagarArquivos } from "@/lib/servidor/arquivos";
import { comSaldo, contexto, debitar, exigirSaldo, responderErro, usdParaCreditos } from "@/lib/servidor/contexto";

export const runtime = "nodejs";
export const maxDuration = 120;

// Modo nuvem: transcreve um áudio já enviado ao armazenamento da conta (Whisper no fal.ai).
export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    const { caminho, segundos } = (await req.json()) as { caminho: string; segundos?: number };
    conferirCaminho(ctx, caminho);
    const usd = Math.max(0.001, ((segundos ?? 30) / 60) * ctx.precos.whisper_por_minuto);
    exigirSaldo(ctx, usdParaCreditos(ctx, usd));
    const fal = createFalClient({ credentials: process.env.FAL_KEY });
    const url = await linkDeLeitura(caminho, 600);
    let r;
    try {
      r = await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe", language: "pt" } });
    } catch {
      r = await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe" } });
    }
    await debitar(ctx, usdParaCreditos(ctx, usd), "Transcrição de voz", { custoUsd: usd, permitirNegativo: true });
    apagarArquivos([caminho]).catch(() => {});
    return comSaldo(Response.json({ texto: String((r.data as { text?: string }).text ?? "").trim() }), ctx);
  } catch (e) {
    return responderErro(e);
  }
}
