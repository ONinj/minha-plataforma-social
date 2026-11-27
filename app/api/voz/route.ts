import { createFalClient } from "@fal-ai/client";
import { conferirCaminho, linkDeLeitura, apagarArquivos, tamanhoDoArquivo } from "@/lib/servidor/arquivos";
import { ErroHttp, acertar, comSaldo, contexto, reservar, responderErro, usdParaCreditos } from "@/lib/servidor/contexto";

export const runtime = "nodejs";
export const maxDuration = 120;

// Modo nuvem: transcreve um áudio já enviado ao armazenamento da conta (Whisper no fal.ai).
export async function POST(req: Request) {
  try {
    const ctx = await contexto(req);
    const { caminho, segundos } = (await req.json()) as { caminho: string; segundos?: number };
    conferirCaminho(ctx, caminho);
    // A duração é estimada pelo tamanho do arquivo (áudio do microfone ~4 KB por segundo), não pelo que o navegador diz.
    const bytes = await tamanhoDoArquivo(caminho);
    if (bytes && bytes > 25 * 1024 * 1024) throw new ErroHttp(400, "Áudio grande demais (máximo 25 MB).");
    const estimados = bytes ? bytes / 4000 : 120;
    const seg = Math.min(1800, Math.max(Number(segundos) || 0, estimados, 5));
    const usd = (seg / 60) * ctx.precos.whisper_por_minuto;
    const creditos = usdParaCreditos(ctx, usd);
    const reserva = await reservar(ctx, { max: creditos, minimo: creditos, descricao: "Transcrição de voz" });
    const fal = createFalClient({ credentials: process.env.FAL_KEY });
    const url = await linkDeLeitura(caminho, 600);
    let r;
    try {
      try {
        r = await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe", language: "pt" } });
      } catch {
        r = await fal.subscribe("fal-ai/whisper", { input: { audio_url: url, task: "transcribe" } });
      }
    } catch (e) {
      await acertar(ctx, reserva.ref, 0).catch(() => {});
      throw e;
    }
    await acertar(ctx, reserva.ref, creditos, { custoUsd: usd, descricao: "Transcrição de voz" });
    apagarArquivos([caminho]).catch(() => {});
    return comSaldo(Response.json({ texto: String((r.data as { text?: string }).text ?? "").trim() }), ctx);
  } catch (e) {
    return responderErro(e);
  }
}
